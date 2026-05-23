---
name: flclash-primary-proxy
description: Make FLClash the primary Linux proxy client when Clash Verge, mihomo, or another Clash client is still holding TUN routes, system proxy settings, or local ports. Use when Chromium or native apps do not appear in FLClash connections, FLClash nodes test OK but system traffic bypasses it, or the user wants to retire Clash Verge and migrate to FLClash.
---

# FLClash Primary Proxy

Use this skill to safely migrate a Linux desktop from Clash Verge or another mihomo frontend to FLClash as the main proxy client.

## Safety Rules

- Do not stop proxy services until you have confirmed which service owns the active TUN, local ports, and system proxy settings.
- Treat `systemctl disable --now`, `pkill`, NetworkManager edits, DNS changes, and TUN route changes as connection-affecting operations.
- If root authentication is required, ask the user to run the exact command with `! sudo ...` instead of retrying failing system commands.
- Prefer a reversible sequence: first make FLClash explicit proxy work, then switch desktop system proxy, then enable FLClash TUN, then disable the old client.
- Keep at least one working path to the internet during the migration. If the assistant session depends on the proxy, make changes in small validated steps.
- Do not write reusable notes containing user node passwords, UUIDs, Reality public keys, short IDs, SSIDs, or private network details.

## Failure Pattern

Common symptoms:

- FLClash node latency test succeeds, but Chromium or other apps do not show in FLClash connections.
- `curl --proxy http://127.0.0.1:7890 ...` works, but FLClash has no records.
- Clash Verge is still running as a root service and owns `7890`, `7897`, `7898`, or the active TUN.
- `ip route get 8.8.8.8` points to `Meta` or a physical interface instead of `FlClash`.
- FLClash TUN exists but is `DOWN`, or uses stale fake-IP/TUN ranges left by another client.

Interpretation shortcuts:

- If `7890` is owned by `clash-verge-service`, explicit proxy traffic goes to Clash Verge, not FLClash.
- If `ip route get 8.8.8.8` points to `Meta`, system traffic is still under Clash Verge TUN.
- If FLClash only listens on DNS port `1053`, its core may be running but the proxy/TUN switch is not active.
- If FLClash and Clash Verge both use `198.18.0.0/16` fake-IP/TUN ranges, expect stale routes and fake-IP conflicts.

## Triage Commands

Check route, TUN, ports, and processes:

```bash
ip route get 8.8.8.8
ip route show table 2022
ip -brief addr show type tun
ss -ltnup | grep -E ':(7890|7896|7897|7898|1053)\b|Netid'
ps -eo pid,user,comm,args | grep -Ei 'clash|mihomo|flclash|verge' | grep -v grep
systemctl status clash-verge-service.service --no-pager
```

Check desktop proxy settings:

```bash
gsettings get org.gnome.system.proxy mode
gsettings get org.gnome.system.proxy.http host
gsettings get org.gnome.system.proxy.http port
gsettings get org.gnome.system.proxy.https host
gsettings get org.gnome.system.proxy.https port
gsettings get org.gnome.system.proxy.socks host
gsettings get org.gnome.system.proxy.socks port
```

Check FLClash files:

```bash
grep -nE 'mixed-port|fake-ip-range|auto-route|auto-detect-interface|AutoDetectInterface|inet4-address|interface-name|dnsHijacking|autoRun' \
  ~/.local/share/com.follow.clash/config.yaml \
  ~/.local/share/com.follow.clash/shared_preferences.json \
  ~/.local/share/com.follow.clash/profiles/*.yaml
```

## Migration Workflow

1. **Prove who currently owns traffic**
   - `ip route get 8.8.8.8` must identify whether the active path is physical, `Meta`, or `FlClash`.
   - `ss -ltnup` must identify whether `7890` belongs to Clash Verge or FLClash.
   - `ps` must identify root-owned `clash-verge-service`, `verge-mihomo`, `FlClashCore`, and user GUI processes.

2. **Fix FLClash persistent config before switching**
   - Ensure `mixed-port` is the intended port, normally `7890` if Clash Verge will be stopped.
   - Ensure TUN is enabled with auto route and auto interface detection.
   - Prefer a FLClash fake-IP/TUN range that does not collide with Clash Verge, e.g. `198.19.0.1/16` for fake-IP and `198.19.0.1/30` for TUN.
   - Remove `interface-name` from relay nodes if the bound interface is not always present; stale interface binding makes nodes appear dead.
   - Keep `autoRun` enabled if FLClash should restore proxy state after restart.

   Example target fragments:

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

   In `shared_preferences.json`, the same settings may be nested inside the JSON string under `flutter.config -> patchClashConfig`. Update both the generated config and the persisted preferences if FLClash keeps rewriting changes.

3. **Validate syntax**

```bash
python - <<'PY'
import json, pathlib
json.loads(pathlib.Path.home().joinpath('.local/share/com.follow.clash/shared_preferences.json').read_text())
print('shared_preferences.json OK')
PY

python - <<'PY'
import pathlib, yaml
base = pathlib.Path.home().joinpath('.local/share/com.follow.clash')
for path in [base/'config.yaml', *base.joinpath('profiles').glob('*.yaml')]:
    yaml.safe_load(path.read_text())
    print(str(path) + ' OK')
PY
```

4. **Stop the old owner**
   - If Clash Verge service owns root core and ports, ask the user to run:

```bash
! sudo systemctl disable --now clash-verge-service.service
```

   - Confirm it is inactive before proceeding:

```bash
systemctl is-enabled clash-verge-service.service
systemctl is-active clash-verge-service.service
pgrep -a verge-mihomo || true
```

5. **Make desktop apps use FLClash**
   - Set the desktop system proxy to FLClash after `7890` is free:

```bash
gsettings set org.gnome.system.proxy mode 'manual'
gsettings set org.gnome.system.proxy.http host '127.0.0.1'
gsettings set org.gnome.system.proxy.http port 7890
gsettings set org.gnome.system.proxy.https host '127.0.0.1'
gsettings set org.gnome.system.proxy.https port 7890
gsettings set org.gnome.system.proxy.socks host '127.0.0.1'
gsettings set org.gnome.system.proxy.socks port 7890
gsettings set org.gnome.system.proxy ignore-hosts "['localhost', '127.0.0.0/8', '::1', '10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16', '*.local']"
```

6. **Restart FLClash only if needed**
   - If `FlClashCore` exists but only DNS is listening, or TUN still has old settings, restart FLClash:

```bash
pkill -TERM FlClashCore
pkill -TERM flclash
gtk-launch com.follow.clash
```

   - If FLClash restarts but does not listen on `7890`, check whether `autoRun` or the in-app proxy/TUN switches are off.

7. **Verify success**

Required success signals:

```bash
ss -ltnup | grep -E ':(7890|1053)\b|Netid'
ip route get 8.8.8.8
ip route show table 2022
ip -brief addr show FlClash
curl --proxy http://127.0.0.1:7890 --max-time 15 -sS -o /dev/null -w 'proxy:%{http_code} %{time_total}\n' https://www.google.com/generate_204
curl --max-time 15 -sS -o /dev/null -w 'default:%{http_code} %{time_total}\n' https://www.google.com/generate_204
```

Expected final shape:

- `7890` is listening under FLClash/FlClashCore, not Clash Verge.
- `ip route get 8.8.8.8` points to `dev FlClash table 2022`.
- `ip route show table 2022` has `default via 198.19.0.2 dev FlClash` or equivalent FLClash gateway.
- Desktop proxy mode is `manual`, pointing to `127.0.0.1:7890`.
- Clash Verge service is `disabled` and `inactive`.
- Both explicit proxy and default-path HTTP tests return success.

## Cleanup Notes

After migration, stale NetworkManager addresses or routes may remain, such as an old `198.18.0.1/30` address on `FlClash`. If current policy routing uses the new FLClash address and tests pass, this is usually not urgent.

Clean stale NetworkManager routes only with root permission and only after verifying the current FLClash route is healthy. Prefer asking the user to run the specific `sudo nmcli ...` command rather than guessing destructive route cleanup.

## Rollback

If FLClash breaks the session:

1. Re-enable Clash Verge service if it was the known-good path:

```bash
! sudo systemctl enable --now clash-verge-service.service
```

2. Set system proxy back to none if desktop apps are stuck on a dead local port:

```bash
gsettings set org.gnome.system.proxy mode 'none'
```

3. If FLClash is partially running, stop only after the old path is restored:

```bash
pkill -TERM FlClashCore
pkill -TERM flclash
```

4. Re-check:

```bash
ip route get 8.8.8.8
ss -ltnup | grep -E ':(7890|7896|7897|7898|1053)\b|Netid'
```
