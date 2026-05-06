import re

BASE58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"

ETH_ADDRESS_RE = re.compile(r"^0x[a-fA-F0-9]{40}$")
TRON_ADDRESS_RE = re.compile(rf"^T[{re.escape(BASE58)}]{{33}}$")
SOL_ADDRESS_RE = re.compile(rf"^[{re.escape(BASE58)}]{{32,44}}$")


def validate_address(chain: str, addr: str) -> bool:
    if chain == "ethereum":
        return bool(ETH_ADDRESS_RE.fullmatch(addr))
    if chain == "tron":
        return bool(TRON_ADDRESS_RE.fullmatch(addr))
    if chain == "solana":
        return bool(SOL_ADDRESS_RE.fullmatch(addr))
    return False
