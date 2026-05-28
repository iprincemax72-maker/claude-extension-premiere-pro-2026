#!/bin/bash
# Tail / dump the unified log collector — one place to see panel + bridge +
# autocut + autoedit + ExtendScript events, time-ordered.
#
# Usage:
#   bash bridge/tail-logs.sh                  # live tail, pretty-printed
#   bash bridge/tail-logs.sh --errors         # live tail, errors+warns only
#   bash bridge/tail-logs.sh --dump [N]       # print last N lines (default 200) and exit
#   bash bridge/tail-logs.sh --dump --module panel   # filter to one module
#
# Modules: panel | bridge | autocut | autoedit | host | render

LOG="$HOME/PremiereClaude/logs/unified.jsonl"
HAVE_JQ=0
command -v jq >/dev/null 2>&1 && HAVE_JQ=1

if [ ! -f "$LOG" ]; then
    echo "No unified log yet at $LOG"
    echo "(It's created the first time any module logs. Open the panel / run a chat.)"
    exit 0
fi

# Pretty formatter: "HH:MM:SS [LEVEL module] msg  data"
fmt() {
    if [ "$HAVE_JQ" = "1" ]; then
        jq -rc '"\(.t[11:19]) [\(.level|ascii_upcase) \(.module)] \(.msg)" + (if .data then "  " + (.data|tostring) else "" end)' 2>/dev/null
    else
        cat   # no jq → raw JSONL
    fi
}

MODE="tail"
MODULE=""
N=200
ERRORS_ONLY=0
while [ $# -gt 0 ]; do
    case "$1" in
        --dump) MODE="dump" ;;
        --errors) ERRORS_ONLY=1 ;;
        --module) shift; MODULE="$1" ;;
        [0-9]*) N="$1" ;;
    esac
    shift
done

filter() {
    if [ -n "$MODULE" ] && [ "$HAVE_JQ" = "1" ]; then
        jq -c "select(.module==\"$MODULE\")"
    elif [ -n "$MODULE" ]; then
        grep "\"module\":\"$MODULE\""
    else
        cat
    fi
}
levelfilter() {
    if [ "$ERRORS_ONLY" = "1" ] && [ "$HAVE_JQ" = "1" ]; then
        jq -c 'select(.level=="error" or .level=="warn")'
    elif [ "$ERRORS_ONLY" = "1" ]; then
        grep -E '"level":"(error|warn)"'
    else
        cat
    fi
}

if [ "$MODE" = "dump" ]; then
    tail -n "$N" "$LOG" | filter | levelfilter | fmt
else
    echo "Tailing $LOG  (Ctrl+C to stop)"
    [ -n "$MODULE" ] && echo "  filter: module=$MODULE"
    [ "$ERRORS_ONLY" = "1" ] && echo "  filter: errors+warns only"
    echo ""
    tail -n 30 -f "$LOG" | filter | levelfilter | fmt
fi
