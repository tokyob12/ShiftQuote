#!/usr/bin/env bash
# Verifies Shift's testnet contracts on the Elysium explorer, which runs Blockscout.
# Constructor arguments are read back from each contract, so no key is needed.
# DRY_RUN=1 prints the commands without submitting anything.
#
# Retired contracts are left out: the first PositionV2 (0x46093Bb7…) was built from a
# source before requote, and its KeeperBook (0x96440aA2…) is no longer read.
set -euo pipefail
cd "$(dirname "$0")/../.."

RPC="${SHIFT_RPC_URL:-https://testnet-rpc.elysium.kinetiq.xyz}"
VERIFIER_URL="https://testnet.elysium.kinetiq.xyz/api/verify"
EXPLORER="https://testnet.elysium.kinetiq.xyz"
FORGE="${FORGE:-$(command -v forge || echo "$HOME/.foundry/bin/forge")}"
CAST="${CAST:-$(command -v cast || echo "$HOME/.foundry/bin/cast")}"

DEMO_ASSET=0x35578CA58726E86BbFa10526dd7D571923ddD3d9
MOCK_USDC=0xf0A6345093eA6f04768B3CfeaBf50b65A9a3F0c9
SCRIPTED_BOOK=0x3E6E2654Fb3ea12c5772Cc35284C7e226160B7e8
ETH_KEEPER_BOOK=0x52F59Cb79042Dfe6Fe7f12826180318CBb0a283d
POSITION=0x8e3dfb663603D5D21Bfd1BfE1BD470Da2b396815
FAUCET=0x7E5B845DE6D74123cC0C2Bf36Aa3440f110C0A85
SPOT_KEEPER_BOOK=$(python3 -c 'import json;print(json.load(open("deployments/v2.json"))["spotKeeperBook"])')
POSITION_V2=$(python3 -c 'import json;print(json.load(open("deployments/v2.json"))["positionV2"])')

read_address() {
  local value
  value=$("$CAST" call "$1" "$2()(address)" --rpc-url "$RPC")
  [[ "$value" =~ ^0x[0-9a-fA-F]{40}$ ]] || { echo "could not read $2() on $1" >&2; exit 1; }
  echo "$value"
}
encode() { "$CAST" abi-encode "$@"; }

verify() {
  local address=$1 id=$2 args=$3
  [[ "$args" =~ ^0x[0-9a-f]+$ ]] || { echo "no constructor arguments for $id" >&2; exit 1; }
  echo "== ${id##*:} at $address"
  local cmd=("$FORGE" verify-contract "$address" "$id"
    --chain 99801 --verifier blockscout --verifier-url "$VERIFIER_URL"
    --skip-is-verified-check --watch --constructor-args "$args")
  if [[ "${DRY_RUN:-}" == "1" ]]; then
    printf '%q ' "${cmd[@]}"
    echo
  else
    "${cmd[@]}"
    echo "   $EXPLORER/address/$address?tab=contract"
  fi
}

position_args() {
  encode "constructor(address,address,address,address)" \
    "$(read_address "$1" owner)" "$(read_address "$1" base)" \
    "$(read_address "$1" quote)" "$(read_address "$1" reader)"
}

verify "$DEMO_ASSET" contracts/src/DemoAsset.sol:DemoAsset \
  "$(encode "constructor(address)" "$(read_address "$DEMO_ASSET" minter)")"
verify "$MOCK_USDC" contracts/src/MockUsdc.sol:MockUsdc \
  "$(encode "constructor(address)" "$(read_address "$MOCK_USDC" minter)")"
verify "$SCRIPTED_BOOK" contracts/src/ScriptedBook.sol:ScriptedBook \
  "$(encode "constructor(address)" "$(read_address "$SCRIPTED_BOOK" owner)")"
verify "$ETH_KEEPER_BOOK" contracts/src/KeeperBook.sol:KeeperBook \
  "$(encode "constructor(address)" "$(read_address "$ETH_KEEPER_BOOK" keeper)")"
verify "$POSITION" contracts/src/Position.sol:Position "$(position_args "$POSITION")"
verify "$FAUCET" contracts/src/Faucet.sol:Faucet \
  "$(encode "constructor(address,address)" "$(read_address "$FAUCET" base)" "$(read_address "$FAUCET" quote)")"
verify "$SPOT_KEEPER_BOOK" contracts/src/KeeperBook.sol:KeeperBook \
  "$(encode "constructor(address)" "$(read_address "$SPOT_KEEPER_BOOK" keeper)")"
verify "$POSITION_V2" contracts/src/PositionV2.sol:PositionV2 "$(position_args "$POSITION_V2")"
