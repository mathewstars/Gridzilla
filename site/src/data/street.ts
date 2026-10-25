// One street, one evening, measured on the simulated fleet: Gersthof's street transformer (tf:gersthof-68, rated
// 400 kW). Each row is [sim hour, kW without Gridzilla, kW with Gridzilla], every 15 grid minutes. "Without" is the
// platform's counterfactual for the same houses, same cars, same weather and no signal (baseline_kw); "with" is the
// measured total (total_kw). Recorded from GET /api/history?nodes=tf:gersthof-68 on a local platform run of this repo
// on 2026-10-25 (the run that took the console screenshots). The submission's 511 to 325 kW is another street, Atzgersdorf,
// measured on 24 Oct.
export const STREET = {
  name: "Gersthof",
  node: "tf:gersthof-68",
  ratingKw: 400,
  recorded: "2026-10-25T13:12:01Z",
  peakWithoutKw: 556,
  peakWithKw: 308,
} as const;

/** [hour, without kW, with kW] */
export const STREET_DAY: [number, number, number][] = [
  [13.25, -13.9, -13.9],
  [16.0, 27.4, 27.4],
  [16.25, 31.2, 31.2],
  [16.5, 35.1, 35.1],
  [16.75, 44.4, 44.4],
  [17.0, 49.1, 49.1],
  [17.25, 59.6, 59.6],
  [17.5, 64.6, 64.6],
  [17.75, 80.4, 80.4],
  [18.0, 84.9, 84.9],
  [18.25, 133.2, 133.2],
  [18.5, 224.3, 224.3],
  [18.75, 336.3, 277.1],
  [19.0, 336.6, 277.4],
  [19.25, 334.4, 275.2],
  [19.5, 419.4, 272.2],
  [19.75, 451.7, 292.0],
  [20.0, 445.9, 262.3],
  [20.25, 556.2, 252.6],
  [20.5, 551.1, 247.5],
  [20.75, 540.7, 308.0],
  [21.0, 536.6, 305.4],
  [21.25, 527.8, 298.2],
  [21.5, 526.4, 297.2],
  [21.75, 361.4, 232.0],
  [22.0, 359.0, 231.8],
  [22.25, 354.1, 229.3],
  [22.5, 352.4, 229.9],
  [22.75, 349.5, 212.7],
  [23.0, 348.4, 214.1],
  [23.25, 315.0, 212.7],
  [23.5, 314.6, 214.7],
  [23.75, 225.9, 176.4],
];
