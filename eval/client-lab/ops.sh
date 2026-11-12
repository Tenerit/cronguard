#!/bin/sh
# Client « ops » : renouvellement de certificats, nettoyage, heartbeat. Lancé avec une limite mémoire (OOM).
set -e
apk add --no-cache -q bash curl python3 >/dev/null
adduser -D -u 1000 app
curl -fsS "$CG_URL/sdk/cronguard.sh" -o /usr/local/lib/cronguard.sh
mkdir -p /opt/jobs /etc/ops /srv/tmp && chown app /srv/tmp
cat > /opt/jobs/renew-certs.sh <<'EOF'
#!/bin/sh
echo "certificates checked: 3 valid, 0 to renew"
EOF
cat > /opt/jobs/cleanup.sh <<'EOF'
#!/bin/sh
find /srv/tmp -type f -mmin +60 -delete
# Indexation des fichiers restants (charge toute la liste en mémoire quand /etc/ops/full-index existe).
[ -f /etc/ops/full-index ] && python3 -c "x = bytearray(900 * 1024 * 1024); print(len(x))"
exit 0
EOF
printf '#!/bin/sh\necho alive\n' > /opt/jobs/heartbeat.sh
chmod +x /opt/jobs/*.sh
W="CRONGUARD_URL=$CG_URL bash -c 'source /usr/local/lib/cronguard.sh && cg_run"
cat > /etc/crontabs/app <<EOF
* * * * * $W $KEY_CERTS bash -c "\$0"' '/opt/jobs/renew-certs.sh'
* * * * * $W $KEY_CLEANUP bash -c "\$0"' '/opt/jobs/cleanup.sh'
* * * * * $W $KEY_HEARTBEAT bash -c "\$0"' '/opt/jobs/heartbeat.sh'
EOF
crond -b -l 8
echo READY
