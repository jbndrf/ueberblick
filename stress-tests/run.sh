#!/usr/bin/env bash
#
# Stress test runner for Ueberblick
#
# Usage:
#   ./run.sh seed          # Seed test data
#   ./run.sh clean         # Remove test data
#   ./run.sh 01            # Run dimension 1 (concurrent reads)
#   ./run.sh 01 02 03      # Run dimensions 1, 2, 3
#   ./run.sh all           # Run all dimensions sequentially
#   ./run.sh monitor       # Show docker stats during a test run
#
# Environment:
#   PB_URL=http://localhost:8090   # PocketBase URL (default)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
K6_DIR="${SCRIPT_DIR}/k6"
RESULTS_DIR="${SCRIPT_DIR}/results"
PB_URL="${PB_URL:-http://localhost:8090}"

export PB_URL

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log() { echo -e "${GREEN}[stress]${NC} $*"; }
warn() { echo -e "${YELLOW}[stress]${NC} $*"; }
err() { echo -e "${RED}[stress]${NC} $*" >&2; }

check_deps() {
    if ! command -v k6 &>/dev/null; then
        err "k6 not found. Install: https://grafana.com/docs/k6/latest/set-up/install-k6/"
        exit 1
    fi
    if ! command -v npx &>/dev/null; then
        err "npx not found. Install Node.js."
        exit 1
    fi
}

check_pb() {
    if ! curl -sf "${PB_URL}/api/health" >/dev/null 2>&1; then
        err "PocketBase not reachable at ${PB_URL}"
        err "Start the deployment: docker compose up -d"
        exit 1
    fi
    log "PocketBase healthy at ${PB_URL}"
}

seed_data() {
    log "Seeding stress test data..."
    cd "${SCRIPT_DIR}/.."
    npx tsx stress-tests/seed.ts
    log "Seeding complete."
}

clean_data() {
    log "Cleaning stress test data..."
    cd "${SCRIPT_DIR}/.."
    npx tsx stress-tests/seed.ts --clean
    log "Cleanup complete."
}

run_dimension() {
    local dim="$1"
    local script="${K6_DIR}/dimensions/${dim}-*.js"

    # Expand glob
    local files=( ${script} )
    if [[ ! -f "${files[0]}" ]]; then
        err "No test file found for dimension ${dim}"
        return 1
    fi

    local test_file="${files[0]}"
    local test_name
    test_name="$(basename "${test_file}" .js)"

    # Check manifest exists
    if [[ ! -f "${SCRIPT_DIR}/manifest.json" ]]; then
        err "manifest.json not found. Run './run.sh seed' first."
        exit 1
    fi

    mkdir -p "${RESULTS_DIR}"
    local timestamp
    timestamp="$(date +%Y%m%d-%H%M%S)"
    local output_file="${RESULTS_DIR}/${test_name}-${timestamp}.json"

    log "Running: ${test_name}"
    log "Output:  ${output_file}"
    echo ""

    # Run k6 from the k6 directory so relative file paths work
    cd "${K6_DIR}"
    k6 run \
        --env PB_URL="${PB_URL}" \
        --summary-trend-stats="avg,min,med,max,p(90),p(95),p(99)" \
        --out "json=${output_file}" \
        "dimensions/${dim}-"*.js

    echo ""
    log "Results saved to ${output_file}"

    # Also save summary as text
    log "Done: ${test_name}"
    echo ""
}

monitor() {
    log "Monitoring Docker containers (Ctrl+C to stop)..."
    docker stats pocketbase-backend sveltekit-frontend --format \
        "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.NetIO}}\t{{.BlockIO}}"
}

# Main
check_deps

case "${1:-help}" in
    seed)
        check_pb
        seed_data
        ;;
    clean)
        check_pb
        clean_data
        ;;
    monitor)
        monitor
        ;;
    all)
        check_pb
        for dim in 01 02 03 04 05 06 07; do
            run_dimension "$dim"
            log "Cooldown 15s before next dimension..."
            sleep 15
        done
        log "All dimensions complete. Results in ${RESULTS_DIR}/"
        ;;
    help|--help|-h)
        echo "Usage: $0 {seed|clean|monitor|all|01|02|03|04|05|06|07}"
        echo ""
        echo "Commands:"
        echo "  seed      Seed stress test data into PocketBase"
        echo "  clean     Remove stress test data"
        echo "  monitor   Show Docker container stats"
        echo "  all       Run all 7 dimensions sequentially"
        echo "  01-07     Run a specific dimension"
        echo ""
        echo "Environment:"
        echo "  PB_URL    PocketBase URL (default: http://localhost:8090)"
        ;;
    *)
        check_pb
        for dim in "$@"; do
            run_dimension "$dim"
        done
        ;;
esac
