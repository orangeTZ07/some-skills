#!/usr/bin/env bash
set -euo pipefail

# Idempotently restore DNAT/SNAT rules for a simple VPN/proxy relay.
# Configure via environment variables or edit defaults before installing.

WAN_IF="${WAN_IF:-ens17}"
ORIGIN_IP="${ORIGIN_IP:?set ORIGIN_IP to the upstream proxy/VPS IP}"
TCP_IN="${TCP_IN:-}"
TCP_OUT="${TCP_OUT:-443}"
UDP_IN="${UDP_IN:-}"
UDP_OUT="${UDP_OUT:-1145}"
ENABLE_UDP="${ENABLE_UDP:-1}"

: "${TCP_IN:?set TCP_IN to the relay public TCP port}"

ensure_rule() {
  local table="$1"
  shift
  if [[ "$table" == "filter" ]]; then
    iptables -C "$@" 2>/dev/null || iptables -A "$@"
  else
    iptables -t "$table" -C "$@" 2>/dev/null || iptables -t "$table" -A "$@"
  fi
}

ensure_rule nat PREROUTING -i "$WAN_IF" -p tcp --dport "$TCP_IN" \
  -j DNAT --to-destination "$ORIGIN_IP:$TCP_OUT"
ensure_rule filter FORWARD -i "$WAN_IF" -p tcp -d "$ORIGIN_IP" --dport "$TCP_OUT" -j ACCEPT
ensure_rule nat POSTROUTING -o "$WAN_IF" -p tcp -d "$ORIGIN_IP" --dport "$TCP_OUT" -j MASQUERADE

if [[ "$ENABLE_UDP" == "1" ]]; then
  : "${UDP_IN:?set UDP_IN to the relay public UDP port, or set ENABLE_UDP=0}"
  ensure_rule nat PREROUTING -i "$WAN_IF" -p udp --dport "$UDP_IN" \
    -j DNAT --to-destination "$ORIGIN_IP:$UDP_OUT"
  ensure_rule filter FORWARD -i "$WAN_IF" -p udp -d "$ORIGIN_IP" --dport "$UDP_OUT" -j ACCEPT
  ensure_rule nat POSTROUTING -o "$WAN_IF" -p udp -d "$ORIGIN_IP" --dport "$UDP_OUT" -j MASQUERADE
fi

ensure_rule filter FORWARD -o "$WAN_IF" -m conntrack --ctstate RELATED,ESTABLISHED -j ACCEPT
