import { useState } from "react";
import type { FormEvent, KeyboardEvent } from "react";

interface AddressInputProps {
  onSubmit: (address: string) => void;
  loading: boolean;
}

const ADDRESS_REGEX = /^0x[0-9a-fA-F]{40}$/;

export function AddressInput({ onSubmit, loading }: AddressInputProps) {
  const [address, setAddress] = useState("");
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    const trimmed = address.trim();
    if (!ADDRESS_REGEX.test(trimmed)) {
      setError("Please enter a valid Ethereum wallet address.");
      return;
    }
    setError(null);
    onSubmit(trimmed);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      handleSubmit();
    }
  }

  return (
    <form onSubmit={handleSubmit} className="ui-stack-tight">
      <div className="flex w-full flex-col gap-[0.75em] sm:flex-row">
        <input
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          onKeyDown={handleKeyDown}
          type="text"
          placeholder="Enter Ethereum wallet address (0x...)"
          className="w-full rounded-[var(--ui-radius)] border border-[rgba(255,255,255,0.2)] bg-[rgba(255,255,255,0.04)] py-[0.5em] pl-[1em] pr-[1em] font-mono text-[87.5%] text-white outline-none transition focus:border-[rgba(127,119,221,0.45)]"
        />
        <button
          type="submit"
          disabled={loading}
          className="ui-btn shrink-0 bg-[#111] text-white hover:bg-black disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? "Loading..." : "Track"}
        </button>
      </div>
      {error && <p className="ui-text-body text-red-400">{error}</p>}
    </form>
  );
}
