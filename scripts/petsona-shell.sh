# Petsona terminal helpers. Source this file from zsh/bash:
#   source /path/to/catcat/scripts/petsona-shell.sh

petsona_say() {
  command petsona-say "$@"
}

petsona_run() {
  command petsona-run "$@"
}

petsona_last_status() {
  local status=$?
  local message="${1:-last command}"
  if [ "$status" -eq 0 ]; then
    command petsona-say --level success --title "完成" "$message"
  else
    command petsona-say --level error --title "失败" "$message exited $status"
  fi
  return "$status"
}
