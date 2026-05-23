# Clash / Mihomo Configuration

Use this reference when building client configs for direct and relay nodes, or applying rule-providers.

## Strategy Groups

Use visible mode groups so the user can switch deliberately:

```yaml
proxy-groups:
  - name: "Proxy"
    type: select
    proxies:
      - "Relay Mode"
      - "Auto Reality"
      - "Direct VPS Mode"
      - DIRECT

  - name: "Direct VPS Mode"
    type: select
    proxies:
      - "Reality-Direct"
      - "Hysteria2-Direct"

  - name: "Relay Mode"
    type: select
    proxies:
      - "Reality-Relay"
      - "Hysteria2-Relay"

  - name: "Auto Reality"
    type: url-test
    proxies:
      - "Reality-Direct"
      - "Reality-Relay"
    url: "http://www.gstatic.com/generate_204"
    interval: 300
    tolerance: 80
```

If the goal is "make restricted network work," put Relay Mode first. If the goal is "prefer fastest on any network," use Auto, but explain that Auto may choose direct.

## Relay Node Interface Binding

Only bind relay nodes to an interface when:

- The platform/core supports `interface-name`.
- The interface name is stable.
- The interface is expected to be online whenever relay mode is used.

Example:

```yaml
  - name: "Reality-Relay"
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
```

If the interface disappears, the node will usually become unhealthy. On mobile clients, interface binding may be unavailable or named differently; prefer not to include desktop-only binding in mobile profiles unless supported.

## Loyalsoldier Rule Providers

Use `rule-providers` for maintainable rules when the client supports them:

```yaml
rule-providers:
  proxy:
    type: http
    behavior: domain
    url: "https://cdn.jsdelivr.net/gh/Loyalsoldier/clash-rules@release/proxy.txt"
    path: ./ruleset/proxy.yaml
    interval: 86400
  direct:
    type: http
    behavior: domain
    url: "https://cdn.jsdelivr.net/gh/Loyalsoldier/clash-rules@release/direct.txt"
    path: ./ruleset/direct.yaml
    interval: 86400
  cncidr:
    type: http
    behavior: ipcidr
    url: "https://cdn.jsdelivr.net/gh/Loyalsoldier/clash-rules@release/cncidr.txt"
    path: ./ruleset/cncidr.yaml
    interval: 86400
  telegramcidr:
    type: http
    behavior: ipcidr
    url: "https://cdn.jsdelivr.net/gh/Loyalsoldier/clash-rules@release/telegramcidr.txt"
    path: ./ruleset/telegramcidr.yaml
    interval: 86400
```

Rules:

```yaml
rules:
  - RULE-SET,proxy,Proxy
  - RULE-SET,direct,DIRECT
  - RULE-SET,cncidr,DIRECT
  - RULE-SET,telegramcidr,Proxy
  - GEOIP,CN,DIRECT
  - MATCH,Proxy
```

Use jsDelivr when `raw.githubusercontent.com` is slow or blocked.

## Runtime Checks

Read strategy state:

```bash
curl --unix-socket /tmp/verge/verge-mihomo.sock -sS http://mihomo/proxies/<url-encoded-group>
```

Switch a group:

```bash
curl --unix-socket /tmp/verge/verge-mihomo.sock -sS \
  -X PUT http://mihomo/proxies/<url-encoded-group> \
  -H 'Content-Type: application/json' \
  --data '{"name":"Relay Mode"}'
```

Check loaded rules:

```bash
curl --unix-socket /tmp/verge/verge-mihomo.sock -sS http://mihomo/rules
```

## Common Client Issues

- **FLClash succeeds, Clash Verge fails**: desktop-only `interface-name` points to an offline interface.
- **Config order changed but selection did not**: Clash keeps runtime selected group after reload.
- **Relay group says dead**: check route to relay IP and whether the bound interface exists.
- **Auto chooses direct**: set the main group to Relay Mode for restricted networks.
- **Rule-providers not loaded**: the core may be legacy Clash, not Premium/mihomo.
