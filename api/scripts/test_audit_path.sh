#!/usr/bin/env bash
# test_audit_path.sh
# Run backend self-checks for audit path initialization and progress.
# Requires: curl, jq. API must be running and reachable at BASE_URL (default http://localhost:4000/api)

set -euo pipefail
BASE_URL=${BASE_URL:-http://localhost:4000/api}
# Use an array for curl + header so arguments are preserved correctly when expanded
CURL=(curl -sS -H "Content-Type: application/json")

echo "Using BASE_URL=$BASE_URL"

# Helper: pretty print and return JSON value
jqp() { echo "$1" | jq -r "$2"; }

# Test 1: Create audit without path
echo "\nTest 1: Create audit without path"
resp=$("${CURL[@]}" -X POST "$BASE_URL/audits" -d '{"title":"Finance Audit","domain":"AP"}')
echo "$resp" | jq '.'
id=$(echo "$resp" | jq -r '.data.header.audit_id // .header.audit_id')
if [ "$id" = "null" ] || [ -z "$id" ]; then echo "FAILED: no audit id returned"; exit 1; fi
# Check path_id is null
path_id=$(echo "$resp" | jq -r '.data.header.path_id // .header.path_id // empty')
if [ -n "$path_id" ] && [ "$path_id" != "null" ]; then echo "FAILED: expected path_id=null got $path_id"; exit 1; fi
# Check no steps returned
steps_count=$(echo "$resp" | jq -r '.data.steps | length // .steps | length // 0')
if [ "$steps_count" -ne 0 ]; then echo "FAILED: expected 0 steps, got $steps_count"; exit 1; fi

echo "Test 1 OK (audit_id=$id)"

# Test 2: Create audit with path_id=1
echo "\nTest 2: Create audit with path_id=1"
resp=$("${CURL[@]}" -X POST "$BASE_URL/audits" -d '{"title":"AP Audit","domain":"AP","path_id":1}')
echo "$resp" | jq '.'
id2=$(echo "$resp" | jq -r '.data.header.audit_id // .header.audit_id')
if [ "$id2" = "null" ] || [ -z "$id2" ]; then echo "FAILED: no audit id returned"; exit 1; fi
# Check path_id = 1
path_id2=$(echo "$resp" | jq -r '.data.header.path_id // .header.path_id')
if [ "$path_id2" != "1" ]; then echo "FAILED: expected path_id=1 got $path_id2"; exit 1; fi
# Check steps seeded: first in_progress, others not_started
first_status=$(echo "$resp" | jq -r '.data.steps[0].status // .steps[0].status')
if [ "$first_status" != "in_progress" ]; then echo "FAILED: first step expected in_progress but got $first_status"; exit 1; fi
remaining_not_started=$(echo "$resp" | jq -r '[.data.steps[1:][]?.status // .steps[1:][]?.status] | all(.=="not_started")')
if [ "$remaining_not_started" != "true" ]; then echo "FAILED: expected remaining steps not_started"; exit 1; fi

echo "Test 2 OK (audit_id=$id2)"

# Test 3: Set path after creation (use id from Test 1)
echo "\nTest 3: Set path on audit $id (path_id=1)"
resp=$("${CURL[@]}" -X PUT "$BASE_URL/audits/$id/path" -d '{"path_id":1}')
echo "$resp" | jq '.'
# Verify seeded
first_status=$(echo "$resp" | jq -r '.data.steps[0].status // .steps[0].status')
if [ "$first_status" != "in_progress" ]; then echo "FAILED: first step expected in_progress but got $first_status"; exit 1; fi

echo "Test 3 OK"

# Test 4: Advance step
echo "\nTest 4: Advance step on audit $id2"
# get current_step_id
current_step_id=$("${CURL[@]}" -X GET "$BASE_URL/audits/$id2" | jq -r '.data.header.current_step_id // .header.current_step_id')
if [ -z "$current_step_id" ] || [ "$current_step_id" = "null" ]; then echo "FAILED: no current_step_id"; exit 1; fi
resp=$("${CURL[@]}" -X POST "$BASE_URL/audits/$id2/advance-step" -d "{\"step_id\":$current_step_id, \"advance\": true}")
echo "$resp" | jq '.'
# Validate that current step is done and next in_progress (fetch audit)
resp2=$("${CURL[@]}" -X GET "$BASE_URL/audits/$id2")
echo "$resp2" | jq '.'
# simple check: previous step should now have status 'done'
prev_status=$(echo "$resp2" | jq -r --arg sid "$current_step_id" '.data.steps[] | select(.step_id|tostring==$sid) | .status // .status')
if [ "$prev_status" != "done" ]; then echo "FAILED: expected previous step done, got $prev_status"; exit 1; fi

echo "Test 4 OK"

# Test 5: Advance to arbitrary step (pick last step)
echo "\nTest 5: Advance to arbitrary step on audit $id2"
last_step_id=$( "${CURL[@]}" -X GET "$BASE_URL/audits/$id2" | jq -r '.data.steps | last(.[]?) | .step_id // .steps | last(.[]?) | .step_id')
if [ -z "$last_step_id" ] || [ "$last_step_id" = "null" ]; then echo "FAILED: could not determine last step id"; exit 1; fi
resp=$("${CURL[@]}" -X POST "$BASE_URL/audits/$id2/advance-to-step" -d "{\"step_id\":$last_step_id}")
echo "$resp" | jq '.'
# Verify that steps before are done, this is in_progress, later none
resp2=$("${CURL[@]}" -X GET "$BASE_URL/audits/$id2")
# check selected step status
sel_status=$(echo "$resp2" | jq -r --arg sid "$last_step_id" '.data.steps[] | select(.step_id|tostring==$sid) | .status // .status')
if [ "$sel_status" != "in_progress" ]; then echo "FAILED: expected selected step in_progress got $sel_status"; exit 1; fi

echo "Test 5 OK"

# Test 6: Save progress (notes)
echo "\nTest 6: Save progress for audit $id2, step $last_step_id"
resp=$("${CURL[@]}" -X POST "$BASE_URL/audits/$id2/progress" -d "{\"step_id\":$last_step_id, \"notes\": \"Interview complete\"}")
echo "$resp" | jq '.'
# Verify notes persisted
resp2=$("${CURL[@]}" -X GET "$BASE_URL/audits/$id2")
notes=$(echo "$resp2" | jq -r --arg sid "$last_step_id" '.data.steps[] | select(.step_id|tostring==$sid) | .notes // .notes')
if [ "$notes" != "Interview complete" ]; then echo "FAILED: notes not persisted: $notes"; exit 1; fi

echo "Test 6 OK"

# Test 7: Recalc percent
echo "\nTest 7: Recalc percent for audit $id2"
resp=$("${CURL[@]}" -X POST "$BASE_URL/audits/$id2/recalc-percent")
echo "$resp" | jq '.'
# Verify percent_complete present on header
resp2=$("${CURL[@]}" -X GET "$BASE_URL/audits/$id2")
percent=$(echo "$resp2" | jq -r '.data.header.percent_complete // .header.percent_complete // empty')
if [ -z "$percent" ]; then echo "FAILED: percent_complete missing"; exit 1; fi

echo "Test 7 OK"

echo "\nAll tests finished. Note: These tests require the API to be running and that path_id=1 exists with steps in DB."
