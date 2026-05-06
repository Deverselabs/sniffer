import http from "k6/http";
import { check } from "k6";

export const options = {
  vus: 50,
  duration: "30s",
  thresholds: {
    http_req_duration: ["p(95)<8000"],
  },
};

const addresses = [
  { address: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045", chain: "ethereum" },
  { address: "TJDENsfBJs4RFETt1X1W8wMDc8M5XnJhd6", chain: "tron" },
  { address: "5HcS2Qej4uPKop4pNaDHnVywxLvcw36M7w52Q7Yx5Q8g", chain: "solana" },
];

export default function () {
  const target = __ENV.K6_BASE_URL || "http://localhost:8000";
  const sample = addresses[Math.floor(Math.random() * addresses.length)];
  const res = http.post(
    `${target}/api/v1/scan`,
    JSON.stringify(sample),
    { headers: { "Content-Type": "application/json" } },
  );
  check(res, {
    "status is 200": (r) => r.status === 200,
  });
}
