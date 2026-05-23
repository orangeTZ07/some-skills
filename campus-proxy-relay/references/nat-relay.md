# NAT Relay

Use this reference when building or persisting a near-side NAT relay that forwards client traffic to an origin proxy VPS.

## When To Use

Use a NAT relay when:

- The restricted network reaches a domestic/near-side NAT more reliably than the overseas VPS.
- The origin proxy service works from other networks.
- The user can allocate public mapped ports on the NAT.

Do not expect a relay to fix:

- Loss between the restricted network and the relay itself.
- A broken origin proxy service.
- Wrong Reality UUID/public key/shortId/client fingerprint.

## Port Plan

Reserve distinct ports:

- Keep SSH/admin mapping unchanged.
- Map one TCP port for Reality/VLESS.
- Optionally map one UDP port for Hysteria2 testing.

Example plan:

```text
<relay-public-ip>:<relay-tcp-port>/tcp -> <relay-lan-ip>:<relay-tcp-port>/tcp
<relay-public-ip>:<relay-udp-port>/udp -> <relay-lan-ip>:<relay-udp-port>/udp
```

Kernel forwarding on the relay:

```text
<relay-tcp-port>/tcp -> <origin-vps-ip>:<origin-reality-port>/tcp
<relay-udp-port>/udp -> <origin-vps-ip>:<origin-hysteria2-port>/udp
```

## Temporary Rules

Use scoped, additive rules:

```bash
iptables -t nat -A PREROUTING -i <wan-if> -p tcp --dport <relay-tcp-port> \
  -j DNAT --to-destination <origin-vps-ip>:<origin-reality-port>

iptables -A FORWARD -i <wan-if> -p tcp -d <origin-vps-ip> \
  --dport <origin-reality-port> -j ACCEPT

iptables -t nat -A POSTROUTING -o <wan-if> -p tcp -d <origin-vps-ip> \
  --dport <origin-reality-port> -j MASQUERADE
```

Add equivalent UDP rules only if testing UDP.

## Persistence

Prefer an idempotent systemd oneshot service over raw manual duplication. Use the bundled script template:

```bash
install -m 0755 scripts/vpn-relay-iptables.sh /usr/local/sbin/vpn-relay-iptables.sh
```

Set environment or edit variables in the script:

```bash
WAN_IF=<wan-if>
ORIGIN_IP=<origin-vps-ip>
TCP_IN=<relay-tcp-port>
TCP_OUT=<origin-reality-port>
UDP_IN=<relay-udp-port>
UDP_OUT=<origin-hysteria2-port>
```

Create a unit:

```ini
[Unit]
Description=Restore VPN relay iptables DNAT rules
After=network-online.target docker.service
Wants=network-online.target

[Service]
Type=oneshot
ExecStart=/usr/local/sbin/vpn-relay-iptables.sh
RemainAfterExit=yes

[Install]
WantedBy=multi-user.target
```

Then:

```bash
systemctl daemon-reload
systemctl enable --now vpn-relay-iptables.service
systemctl status vpn-relay-iptables.service --no-pager
```

## Verification

From outside the relay:

```bash
nc -vz -w 5 <relay-public-ip> <relay-tcp-port>
nc -uvz -w 5 <relay-public-ip> <relay-udp-port>
openssl s_client -connect <relay-public-ip>:<relay-tcp-port> -servername <sni> -brief </dev/null
```

On the relay:

```bash
iptables -t nat -vnL PREROUTING | grep <relay-tcp-port>
iptables -vnL FORWARD | grep <origin-vps-ip>
iptables -t nat -vnL POSTROUTING | grep <origin-vps-ip>
```

## Rollback

Before persisting, save:

```bash
iptables-save > /root/iptables-before-vpn-relay.rules
```

Rollback:

```bash
systemctl disable --now vpn-relay-iptables.service
iptables-restore < /root/iptables-before-vpn-relay.rules
```

Remove files only after confirming rollback:

```bash
rm /etc/systemd/system/vpn-relay-iptables.service
rm /usr/local/sbin/vpn-relay-iptables.sh
systemctl daemon-reload
```
