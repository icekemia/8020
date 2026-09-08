#!/usr/bin/env bash
set -euo pipefail
umask 077

: "${SITEGROUND_HOST:?Set the SiteGround host secret}"
: "${SITEGROUND_USER:?Set the SiteGround user secret}"
: "${SITEGROUND_SSH_KEY:?Set the deployment private key secret}"
: "${SITEGROUND_KNOWN_HOSTS:?Set the verified SSH host keys}"
: "${SITEGROUND_ROOT:?Set the domain directory, parent of public_html}"
: "${SITEGROUND_PHP:?Set the absolute PHP CLI path}"
: "${SITEGROUND_URL:?Set the HTTPS testing URL}"
port="${SITEGROUND_PORT:-18765}"
[[ "$SITEGROUND_HOST" =~ ^[a-zA-Z0-9][a-zA-Z0-9.-]*$ ]]
[[ "$SITEGROUND_USER" =~ ^[a-zA-Z0-9_][a-zA-Z0-9_.-]*$ ]]
[[ "$port" =~ ^[0-9]{1,5}$ ]] && (( port > 0 && port < 65536 ))
[[ "$SITEGROUND_ROOT" =~ ^/[a-zA-Z0-9_./-]+$ && "$SITEGROUND_ROOT" != *'..'* && "$SITEGROUND_ROOT" != */public_html && "$SITEGROUND_ROOT" != */ ]]
[[ "$SITEGROUND_PHP" =~ ^/[a-zA-Z0-9_./-]+$ && "$SITEGROUND_PHP" != *'..'* ]]
[[ "$SITEGROUND_URL" =~ ^https://[a-zA-Z0-9.-]+/?$ ]]
[[ "${GITHUB_SHA:-}" =~ ^[a-f0-9]{40}$ ]]
id="${GITHUB_SHA}-${GITHUB_RUN_ID}-${GITHUB_RUN_ATTEMPT}"
[[ "$id" =~ ^[a-f0-9]{40}-[0-9]+-[0-9]+$ ]]
shopt -s nullglob
archives=(release/*.zip)
[[ ${#archives[@]} == 1 ]] || { echo 'Expected exactly one tested artifact.' >&2; exit 1; }
ssh_dir="$(mktemp -d)"
trap 'rm -f "$ssh_dir/key" "$ssh_dir/known_hosts"; rmdir "$ssh_dir"' EXIT
printf '%s\n' "$SITEGROUND_SSH_KEY" > "$ssh_dir/key"
printf '%s\n' "$SITEGROUND_KNOWN_HOSTS" > "$ssh_dir/known_hosts"
connection=(-i "$ssh_dir/key" -o BatchMode=yes -o IdentitiesOnly=yes -o StrictHostKeyChecking=yes -o "UserKnownHostsFile=$ssh_dir/known_hosts" -o ConnectTimeout=20)
remote="$SITEGROUND_USER@$SITEGROUND_HOST"
incoming="$SITEGROUND_ROOT/.deploy/incoming"
ssh "${connection[@]}" -p "$port" "$remote" "test -f '$SITEGROUND_ROOT/.duel-deploy-enabled' && mkdir -p '$incoming'"
scp "${connection[@]}" -P "$port" "${archives[0]}" "$remote:$incoming/$id.zip"
scp "${connection[@]}" -P "$port" scripts/ci/deploy-remote.php "$remote:$incoming/$id.php"
ssh "${connection[@]}" -p "$port" "$remote" "'$SITEGROUND_PHP' '$incoming/$id.php' '$SITEGROUND_ROOT' '$incoming/$id.zip' '$id' '$GITHUB_SHA' '$SITEGROUND_URL'"
