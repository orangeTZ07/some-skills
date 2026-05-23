# Testing Matrix

Use this reference when the main task is diagnosis, safe test setup, or proving whether traffic uses the intended path.

## Separate Control And Test Paths

The assistant/control session must stay on a known-good path. The test path may be unstable.

Safe patterns:

- Control over mobile hotspot, test over campus USB tethering.
- Control over Ethernet, test over Wi-Fi.
- Control over the existing Clash profile, test through a second mihomo instance on `127.0.0.1:<test-port>`.
- Offline script: user runs it on the restricted network, then reconnects and shares logs.

Risky patterns:

- Switching the only Wi-Fi interface during a live assistant session.
- Adding global default routes to the restricted network.
- Binding the main client to an interface that may disappear.

## Baseline Tests

Run from the restricted interface when possible:

```bash
ping -I <restricted-iface> -c 20 <origin-vps-ip>
ping -I <restricted-iface> -c 20 <relay-ip>
nc -vz -w 8 <origin-vps-ip> <reality-port>
nc -vz -w 8 <relay-ip> <relay-tcp-port>
openssl s_client -connect <relay-ip>:<relay-tcp-port> -servername <sni> -brief </dev/null
```

Read results this way:

- TCP connect succeeds but ping has high loss: expect page loads and long flows to be flaky.
- TLS test returns the expected target certificate through Reality: relay forwarding and Reality fallback are reachable.
- `nc` succeeds but `curl` through proxy fails: inspect client strategy, interface binding, and connection chains.

## Independent Mihomo Test Instance

Use a second mihomo instance to test a restricted interface without touching the main Clash profile.

Minimal shape:

```yaml
port: 17990
socks-port: 17991
allow-lan: false
bind-address: 127.0.0.1
mode: global
log-level: info
ipv6: false
interface-name: <restricted-iface>
external-controller: 127.0.0.1:19090

proxies:
  - name: Reality-Relay-Test
    type: vless
    server: <relay-ip>
    port: <relay-tcp-port>
    uuid: <uuid>
    network: tcp
    udp: true
    tls: true
    flow: xtls-rprx-vision
    servername: <sni>
    reality-opts:
      public-key: <public-key>
      short-id: <short-id>
    client-fingerprint: chrome
    interface-name: <restricted-iface>

proxy-groups:
  - name: USB-Test
    type: select
    proxies:
      - Reality-Relay-Test

rules:
  - MATCH,USB-Test
```

Important: in `mode: global`, switch `GLOBAL` to the test group if needed:

```bash
curl -sS -X PUT http://127.0.0.1:19090/proxies/GLOBAL \
  -H 'Content-Type: application/json' \
  --data '{"name":"USB-Test"}'
```

Test:

```bash
curl --proxy http://127.0.0.1:17990 --max-time 30 \
  https://www.google.com/generate_204 -v
```

## Confirm Actual Chains

Do not trust the UI alone. Query the API:

```bash
curl --unix-socket /tmp/verge/verge-mihomo.sock -sS http://mihomo/connections
```

Check:

- `chains` contains the intended node and strategy group.
- `remoteDestination` is the relay IP when relay mode is selected.
- Old long-lived connections may keep old chains after a group switch; open a new request to verify new behavior.

## Common False Diagnoses

- **Relay group is dead** because the bound interface is not online.
- **Auto group selects direct** because direct currently has lower delay; this does not prove relay is broken.
- **Rules are correct but mode is global/direct**; check `/configs`.
- **Host route affects Codex too** when Codex uses the same proxy node IP as the test.
- **HTTP 403 from a website** means the network path works; it is not a TCP/TLS failure.
