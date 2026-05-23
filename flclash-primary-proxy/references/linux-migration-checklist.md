# Linux FLClash Migration Checklist

Use this checklist when a Linux desktop should move from Clash Verge to FLClash.

## Read-Only Baseline

```bash
ip route get 8.8.8.8
ip route show table 2022
ip -brief addr show type tun
ss -ltnup | grep -E ':(7890|7896|7897|7898|1053)\b|Netid'
ps -eo pid,user,comm,args | grep -Ei 'clash|mihomo|flclash|verge' | grep -v grep
systemctl status clash-verge-service.service --no-pager
```

Interpretation:

- `dev Meta table 2022`: Clash Verge TUN owns system traffic.
- `dev FlClash table 2022`: FLClash owns system traffic.
- `7890` held by Clash Verge: explicit proxy traffic will not reach FLClash.
- FLClash only listening on `1053`: DNS core is up, but proxy/TUN may not be active.

## FLClash Config Targets

Generated config:

```yaml
mixed-port: 7890

dns:
  enable: true
  enhanced-mode: fake-ip
  fake-ip-range: 198.19.0.1/16

tun:
  enable: true
  device: FlClash
  auto-route: true
  auto-detect-interface: true
  inet4-address:
    - 198.19.0.1/30
  stack: mixed
  dns-hijack:
    - any:53
```

Also check `shared_preferences.json`; FLClash may rewrite generated config from its nested `flutter.config` JSON string.

## Switch Order

1. Fix FLClash config and preferences.
2. Validate JSON/YAML syntax.
3. Ask user to stop Clash Verge service if root is needed:

```bash
! sudo systemctl disable --now clash-verge-service.service
```

4. Set desktop system proxy:

```bash
gsettings set org.gnome.system.proxy mode 'manual'
gsettings set org.gnome.system.proxy.http host '127.0.0.1'
gsettings set org.gnome.system.proxy.http port 7890
gsettings set org.gnome.system.proxy.https host '127.0.0.1'
gsettings set org.gnome.system.proxy.https port 7890
gsettings set org.gnome.system.proxy.socks host '127.0.0.1'
gsettings set org.gnome.system.proxy.socks port 7890
```

5. Restart FLClash if the running core still has old state:

```bash
pkill -TERM FlClashCore
pkill -TERM flclash
gtk-launch com.follow.clash
```

6. Verify.

## Success Verification

```bash
systemctl is-enabled clash-verge-service.service
systemctl is-active clash-verge-service.service
ss -ltnup | grep -E ':(7890|1053)\b|Netid'
ip route get 8.8.8.8
ip route show table 2022
ip -brief addr show FlClash
gsettings get org.gnome.system.proxy mode
gsettings get org.gnome.system.proxy.http host
gsettings get org.gnome.system.proxy.http port
curl --proxy http://127.0.0.1:7890 --max-time 15 -sS -o /dev/null -w 'proxy:%{http_code} %{time_total}\n' https://www.google.com/generate_204
curl --max-time 15 -sS -o /dev/null -w 'default:%{http_code} %{time_total}\n' https://www.google.com/generate_204
```

Expected:

- Clash Verge service: `disabled`, `inactive`.
- FLClash listens on `7890` and `1053`.
- `ip route get` points to `FlClash table 2022`.
- System proxy points to `127.0.0.1:7890`.
- Both curl tests succeed.

## Non-Urgent Residuals

A stale `198.18.0.1/30` address may remain on `FlClash` after moving to `198.19.0.1/30`. If table 2022 routes through `198.19.0.2` and tests pass, do not risk cleanup during a live session unless the user explicitly wants it.
