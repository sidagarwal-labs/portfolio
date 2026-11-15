/* The robot vacuum's public status snapshot. Today it is a static file; a later release swaps loadRobotStatus for a
   live feed with the same schema (the robot-vacuum repo's `vac publish`). Only sanitized, read-only fields are part of
   it: no identifiers, network details, or maps. A null field is one the robot didn't report, and the app shows it as unknown. */

export type Consumable = { percentLeft: number | null; hoursLeft: number | null; lastReset: string | null };
export type BatteryReading = { t: string; battery: number };

export type RobotStatus = {
  schema: 1;
  updatedAt: string;
  robot: { model: string; state: string | null; battery: number | null; charging: boolean | null; docked: boolean | null; error: string | null };
  maintenance: { mainBrush: Consumable; sideBrush: Consumable; filter: Consumable };
  lifetime: { cleans: number | null; minutes: number | null; areaM2: number | null };
  /* Charge cycles (equivalent full cycles) and charge sessions count the last 7 days. */
  battery: { chargeCycles: number; chargeSessions: number; history: BatteryReading[] };
  uptime: { rebootsLast7d: number | null };
};

export const robotStatusUrl = `${import.meta.env.BASE_URL}robot-vacuum/status.json`;

const maximumHistory = 1000;
const isoDateTime = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/;
const isoDate = /^\d{4}-\d{2}-\d{2}$/;

export class RobotStatusError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RobotStatusError";
  }
}

function fail(path: string, expected: string): never {
  throw new RobotStatusError(`${path} must be ${expected}.`);
}

function record(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) fail(path, "an object");
  return value as Record<string, unknown>;
}

/* Reads a field that may be null when the robot didn't report it; errors then mention that null is allowed. */
function orNull<T>(value: unknown, path: string, read: (value: unknown, path: string, unknown: string) => T): T | null {
  return value === null ? null : read(value, path, ", or null when unknown");
}

function text(value: unknown, path: string, unknown = "", maximum = 80) {
  if (typeof value !== "string" || !value.trim() || value.length > maximum) fail(path, `text of 1 to ${maximum} characters${unknown}`);
  return value.trim();
}

function flag(value: unknown, path: string, unknown = "") {
  if (typeof value !== "boolean") fail(path, `true or false${unknown}`);
  return value;
}

function number(value: unknown, path: string, { max, integer = false, unknown = "" }: { max?: number; integer?: boolean; unknown?: string } = {}) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || (max !== undefined && value > max) || (integer && !Number.isInteger(value))) {
    fail(path, `${integer ? "a whole number" : "a number"} ${max === undefined ? "of 0 or more" : `from 0 to ${max}`}${unknown}`);
  }
  return value;
}

const percent = (value: unknown, path: string, unknown = "") => number(value, path, { max: 100, unknown });
const amount = (value: unknown, path: string, unknown = "") => number(value, path, { unknown });
const count = (value: unknown, path: string, unknown = "") => number(value, path, { integer: true, unknown });

function dateTime(value: unknown, path: string) {
  if (typeof value !== "string" || !isoDateTime.test(value) || Number.isNaN(Date.parse(value))) fail(path, "an ISO 8601 date and time with a time zone");
  return value;
}

function date(value: unknown, path: string, unknown = "") {
  if (typeof value !== "string" || !(isoDate.test(value) || isoDateTime.test(value)) || Number.isNaN(Date.parse(value))) fail(path, `an ISO 8601 date${unknown}`);
  return value;
}

function consumable(value: unknown, path: string): Consumable {
  const item = record(value, path);
  return {
    percentLeft: orNull(item.percentLeft, `${path}.percentLeft`, percent),
    hoursLeft: orNull(item.hoursLeft, `${path}.hoursLeft`, amount),
    lastReset: orNull(item.lastReset, `${path}.lastReset`, date)
  };
}

/* Checks the snapshot's shape and copies only known fields, so unknown fields are ignored. Throws RobotStatusError. */
export function parseRobotStatus(value: unknown): RobotStatus {
  const root = record(value, "The snapshot");
  if (root.schema !== 1) fail("schema", "1");
  const robot = record(root.robot, "robot");
  const maintenance = record(root.maintenance, "maintenance");
  const lifetime = record(root.lifetime, "lifetime");
  const battery = record(root.battery, "battery");
  const uptime = record(root.uptime, "uptime");
  if (!Array.isArray(battery.history) || battery.history.length > maximumHistory) fail("battery.history", `a list of up to ${maximumHistory} readings`);
  const history = battery.history.map((entry: unknown, index) => {
    const reading = record(entry, `battery.history[${index}]`);
    return { t: dateTime(reading.t, `battery.history[${index}].t`), battery: percent(reading.battery, `battery.history[${index}].battery`) };
  }).sort((a, b) => Date.parse(a.t) - Date.parse(b.t));
  return {
    schema: 1,
    updatedAt: dateTime(root.updatedAt, "updatedAt"),
    robot: {
      model: text(robot.model, "robot.model"),
      state: orNull(robot.state, "robot.state", text),
      /* null also covers a battery reading that is stuck or untrustworthy right now. */
      battery: orNull(robot.battery, "robot.battery", percent),
      charging: orNull(robot.charging, "robot.charging", flag),
      docked: orNull(robot.docked, "robot.docked", flag),
      /* null means no error. */
      error: robot.error === null ? null : text(robot.error, "robot.error", ", or null for no error", 200)
    },
    maintenance: {
      mainBrush: consumable(maintenance.mainBrush, "maintenance.mainBrush"),
      sideBrush: consumable(maintenance.sideBrush, "maintenance.sideBrush"),
      filter: consumable(maintenance.filter, "maintenance.filter")
    },
    lifetime: {
      cleans: orNull(lifetime.cleans, "lifetime.cleans", count),
      minutes: orNull(lifetime.minutes, "lifetime.minutes", amount),
      areaM2: orNull(lifetime.areaM2, "lifetime.areaM2", amount)
    },
    battery: {
      chargeCycles: amount(battery.chargeCycles, "battery.chargeCycles"),
      chargeSessions: count(battery.chargeSessions, "battery.chargeSessions"),
      history
    },
    uptime: { rebootsLast7d: orNull(uptime.rebootsLast7d, "uptime.rebootsLast7d", count) }
  };
}

/* Fetches and validates the latest snapshot. The only place that knows where the data comes from. */
export async function loadRobotStatus(signal?: AbortSignal): Promise<RobotStatus> {
  const response = await fetch(robotStatusUrl, { cache: "no-cache", signal, headers: { Accept: "application/json" } });
  if (!response.ok) throw new RobotStatusError(`The status snapshot didn't load (HTTP ${response.status}).`);
  let body: unknown;
  try {
    body = await response.json();
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new RobotStatusError("The status snapshot isn't valid JSON.");
  }
  return parseRobotStatus(body);
}
