---
name: campus-proxy-relay
description: Diagnose and repair proxy/VPN failures that happen only on campus, enterprise, hotel, or captive networks; decide whether a relay server is needed; build reversible NAT/TCP/UDP relay paths; configure Clash/mihomo clients with direct-vs-relay strategy groups, rule-providers, interface binding, and safe testing. Use when users report that Reality/VLESS, Hysteria2, sing-box, xray, Clash, mihomo, or FLClash works on mobile data but fails, times out, or becomes unusably slow on a restricted network.
---

# Campus Proxy Relay

Use this skill to separate client config bugs, server faults, bad network paths, UDP QoS, and IP/ASN throttling, then build a reversible relay path when the restricted network can reach a better near-side entry.

## Safety Rules

- Do not restart working proxy services while diagnosing unless the user explicitly approves.
- Log every remote change and keep rollback commands before making persistent edits.
- Never write passwords, UUIDs, Reality private keys, public keys tied to a user, shortIds, exact private IPs, or SSIDs into reusable artifacts.
- Treat `rm`, firewall flushes, `iptables-restore`, NetworkManager route edits, and service restarts as high-risk. Prefer additive, scoped, reversible changes.
- Keep the control path separate from the test path. If Codex depends on the proxy being changed, do not globally switch routes without a recovery plan.

## First Triage

Ask or infer these facts before changing anything:

- Which networks work and fail: mobile data, home broadband, campus/enterprise Wi-Fi, USB tethering.
- Which protocols fail: Reality/VLESS TCP, Hysteria2 UDP, SSH, plain HTTPS, DNS.
- Whether failure is connection refusal, TLS timeout, early slow speed, speedtest timeout, or random disconnect.
- Client type: Clash Verge, mihomo, FLClash, sing-box, v2rayN, Shadowrocket, custom config.
- Server layout: one IP or multiple IPs, ports, Docker/systemd, direct or relay.
- Whether the user can provide a temporary relay/NAT machine and extra mapped ports.

Interpretation shortcuts:

- Mobile works, restricted network fails, same IP with multiple protocols fails: suspect target IP/ASN/path throttling.
- Hysteria2 fails more than Reality: suspect UDP/QUIC QoS or loss.
- TCP connects and TLS handshakes but pages fail: suspect high loss/jitter, MTU, or long-flow shaping.
- Relay works on mobile but not desktop: suspect desktop interface binding, route table, stale strategy selection, or client core mismatch.

## Workflow

1. **Baseline without changes**
   - Check local interfaces/routes and current Clash/mihomo state.
   - Test server and relay ports with `ping`, `nc`, and `openssl s_client`.
   - Inspect remote service status only read-only: listeners, Docker, logs, CPU/memory, network counters.

2. **Decide whether a relay is needed**
   - If restricted network to original VPS has high loss or poor path, but can reach a near-side NAT/relay, build a relay.
   - If both original VPS and relay IP are poor from the restricted network, a relay at that location will not fix the path.
   - If only UDP is poor, prefer Reality/VLESS TCP relay first; keep Hysteria2 as secondary.

3. **Build a reversible relay**
   - Prefer kernel DNAT/SNAT on a NAT server when no userspace proxy is installed.
   - Map a near-side public TCP port to the remote Reality TCP port.
   - Optionally map a near-side UDP port to Hysteria2 for testing.
   - Persist rules only after live tests pass.
   - See [NAT Relay](references/nat-relay.md).

4. **Configure clients**
   - Add both direct and relay nodes.
   - Make a visible strategy group: Direct Mode, Relay Mode, Auto Reality.
   - Use Loyalsoldier or equivalent rule-providers for maintainable rules.
   - Bind relay nodes to the intended interface only when the client/core supports it and the interface is always present.
   - See [Clash/mihomo](references/mihomo-clash.md).

5. **Test with isolated paths**
   - Keep Codex/control traffic on a stable path.
   - Use a separate mihomo instance, per-process proxy, or temporary host routes for the test path.
   - Verify actual chains through the Clash/mihomo API, not only UI labels.
   - See [Testing Matrix](references/testing.md).

## Useful Commands

Local network state:

```bash
nmcli device status
ip -brief addr
ip route
ip route get <relay-ip>
ip route get <origin-vps-ip>
```

Port and TLS tests:

```bash
nc -vz -w 5 <relay-ip> <tcp-port>
nc -uvz -w 5 <relay-ip> <udp-port>
openssl s_client -connect <relay-ip>:<tcp-port> -servername <sni> -brief </dev/null
```

Mihomo API checks:

```bash
curl --unix-socket /tmp/verge/verge-mihomo.sock -sS http://mihomo/proxies
curl --unix-socket /tmp/verge/verge-mihomo.sock -sS http://mihomo/connections
curl --unix-socket /tmp/verge/verge-mihomo.sock -sS http://mihomo/rules
```

Proxy reachability:

```bash
curl -sS -o /dev/null -w 'code=%{http_code} total=%{time_total}\n' \
  --proxy http://127.0.0.1:7890 --max-time 25 \
  https://www.google.com/generate_204
```

## When Users Do Not Know What To Do

Guide them through this order:

1. Keep one stable network for the assistant/control session.
2. Identify the restricted network interface separately.
3. Test original VPS from restricted network.
4. Test candidate relay/NAT from restricted network.
5. If relay path is better, request/allocate one TCP mapped port and optionally one UDP mapped port.
6. Build temporary DNAT/SNAT relay and test.
7. Add direct/relay client nodes and strategy groups.
8. Persist relay rules only after client success.
9. Document rollback.

If the user has only one Wi-Fi card, do not switch Wi-Fi during an active remote session unless they accept disconnection. Prefer USB tethering, a second Wi-Fi adapter, a second device, or a local script that writes results to a file while the assistant is disconnected.
