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
    <form onSubmit={handleSubmit} className="space-y-2">
      <div className="flex flex-col gap-3 sm:flex-row">
        <input
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          onKeyDown={handleKeyDown}
          type="text"
          placeholder="Enter Ethereum wallet address (0x...)"
          className="w-full rounded-lg border border-gray-300 px-4 py-2 text-sm outline-none transition focus:border-gray-500"
        />
        <button
          type="submit"
          disabled={loading}
          className="rounded-lg bg-gray-900 px-5 py-2 text-sm font-medium text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? "Loading..." : "Track"}
        </button>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </form>
  );
}
