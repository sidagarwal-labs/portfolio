import type { WritingEntry } from "../types/content";

/* What's next for the robot. The build log's last section and the Lab OS Robot Vacuum app's Roadmap tab share this list. */
export const robotVacuumRoadmap = [
  "The battery: a multimeter check of the pack's voltage, another reseat, then a logged full charge and a full clean off the dock. Then very likely a replacement pack (14.4 V, 5200 mAh, 4S2P).",
  "A battery capacity estimate from how the pack discharges over time.",
  "A robot MCP server.",
  "A live status feed for this site. The Robot Vacuum app in Lab OS shows a static snapshot today.",
  "Later, a live map in Lab OS, after a privacy review."
];

/* Steps already done, for the app's Roadmap tab. Each one is told in the build log. */
export const robotVacuumDone = [
  "Factory reset, joined to Wi-Fi, and bound once in Xiaomi Home to get the local token.",
  "My own local control app: a TypeScript miIO client, a CLI, and a local dashboard, with a simulator and tests.",
  "Battery connector reseated. The robot powered on off the dock and charged to 87%, then the stuck 17% reading came back on its first mapping run.",
  "Off-dock tests: the battery still powers the robot, but its level and charging status stopped updating.",
  "Power-cycle test: the power button didn't clear the stuck reading. Only reseating the connector has brought live readings back.",
  "Main brush, side brush, and filter counters reset to 100% as a baseline, and logged in my app's maintenance log.",
  "Time zone set to US Eastern in Xiaomi Home, so quiet hours run 10 PM to 8 AM Eastern.",
  "Quiet hours in my own time zone in my app, converted if the robot's clock is in another zone. Schedules show read-only.",
  "Health tracking in my app: battery history, charge sessions and cycles, a maintenance log with a reset command, a reboot watchdog, and a publish command for a sanitized public snapshot.",
  "Plain-English commands that run offline, from the CLI or an Ask box in the dashboard. Anything that moves the robot or changes a setting asks first.",
  "A read-only status snapshot on this site."
];

export const robotVacuumLog: WritingEntry = {
  slug: "reviving-a-robot-vacuum",
  title: "Reviving a robot vacuum: a build log",
  date: "November 15, 2026",
  readTime: "5 min",
  summary:
    "A living build log: reviving a MOVA L600 robot vacuum, chasing a battery reading stuck at 17%, fixing a robot that thought it lived in Shanghai, and building my own app to control it on my network.",
  content: [
    {
      type: "note",
      title: "Build log.",
      text: "This is a living log. I add to it as the project moves; the latest status snapshot is in the Robot Vacuum app on this site's Lab OS desktop."
    },
    { type: "heading", text: "The robot" },
    "I picked up a MOVA L600 robot vacuum (MIoT model dreame.vacuum.p2157) to revive and hack on as a lab project.",
    "I gave it a first charge and a factory reset, then joined it to my Wi-Fi through its setup hotspot. I bound it once in the Xiaomi Home app (US region) to get its local token.",
    "Then I built my own app for it: a TypeScript miIO client with a CLI and a local dashboard, plus a simulator and tests. It controls the robot locally, on my own network.",
    { type: "heading", text: "The problem" },
    "The battery read 17% and stayed there, even on the dock. The robot kept rebooting, and it went dark as soon as it left the dock. It was running on dock power only.",
    { type: "heading", text: "Opening it up" },
    "I flipped the robot over and removed the bottom cover to get to the battery.",
    {
      type: "image",
      src: "robot-vacuum/robot-underside-open.jpg",
      alt: "The robot vacuum upside down with its bottom cover removed. The orange main brush runs across the top, a drive wheel sits on each side, and a white battery pack lies in its bay below the brush. Stickers are pixelated.",
      caption: "Flipped over with the bottom cover off. The white battery pack sits in its bay below the main brush. I pixelated the stickers, including the serial sticker.",
      width: 768,
      height: 1024
    },
    "The pack is a P2008-4S2P-MMBK: a 4S2P lithium-ion pack, 14.4 V nominal, 16.6 V max charge, 5.2 Ah. It showed no swelling, leaks, or scorching.",
    {
      type: "image",
      src: "robot-vacuum/battery-label.jpg",
      alt: "Close-up of the battery pack's label: model P2008-4S2P-MMBK, nominal voltage 14.4 V, max charge voltage 16.6 V, nominal capacity 5.2 Ah, with safety warnings. The barcode is pixelated.",
      caption: "The battery pack's label: P2008-4S2P-MMBK, 14.4 V nominal, 16.6 V max charge, 5.2 Ah. The barcode is pixelated.",
      width: 768,
      height: 1024
    },
    "With the dock unplugged, I unplugged the battery connector and seated it again. The pins looked clean.",
    {
      type: "image",
      src: "robot-vacuum/battery-connector.jpg",
      alt: "The white battery pack in its bay, with red, white, and blue leads running from one end to its connector. Stickers are pixelated.",
      caption: "The pack's leads and connector. I unplugged the connector and reseated it with the dock unplugged.",
      width: 1365,
      height: 768
    },
    {
      type: "note",
      title: "Safety.",
      text: "I only touched the connector, with the dock unplugged. Never open or puncture the battery pack itself."
    },
    { type: "heading", text: "The result" },
    "The robot powered on off the dock and read 73%; the 17% had been stale. Back on the dock it charged from 73% to 74% to 78% with no errors, and it went on to reach 87%.",
    "At that point, the likely cause looked like a battery connector that wasn't making good contact.",
    { type: "heading", text: "The fix didn't hold" },
    "After it reached 87%, I started its first mapping run. The robot dropped offline, rebooted, and came back reading 17% again, the same as the original fault.",
    "Tests off the dock showed the battery still powers the robot: it idled and cleaned on battery with no brownout. But the battery level and charging status stopped updating. They stayed stuck at 17% and \"charging\", even off the dock.",
    "My current theory is the pack's built-in electronics, its fuel gauge or protection board. They can latch after a pack sits fully discharged for a long time, and reseating the connector only resets them for a while. A loose connector now looks less likely.",
    "A normal power cycle with the power button didn't clear the stuck 17%. So far, only unplugging and reseating the battery connector has brought live readings back.",
    "The robot also rebooted once more on its own overnight.",
    "Late that morning, after about 10 hours on the plugged-in dock, it still read 17% and \"charging\". The gauge is still frozen.",
    "A short supervised clean also hit a \"collision sensor is stuck\" error. That's likely the bumper, after I put the robot back together.",
    "Next I'll measure the pack's voltage with a multimeter and reseat the connector again. Then I'll log a full charge and a full clean off the dock. I'll very likely replace the pack with one of the same specs: 14.4 V, 5200 mAh, 4S2P. Third-party packs are sold for this model.",
    { type: "heading", text: "What the robot reports" },
    "Before that mapping run, while it charged, I scanned what the robot exposes locally: battery, state, consumables, lifetime stats, Wi-Fi signal, do-not-disturb, and time zone.",
    "The main brush and filter read 0% and the side brush 44%. I reset all three to 100% so tracking starts from a known baseline. Those resets are the first entries in my app's maintenance log.",
    { type: "heading", text: "A robot on Shanghai time" },
    "Quiet hours were set to 10 PM to 8 AM, but the robot's time zone was Asia/Shanghai. So quiet hours were really running in the middle of the day in US Eastern time: in November, 10 PM to 8 AM in Shanghai is 9 AM to 7 PM Eastern.",
    "I couldn't change the zone over the local network. It was read-only there, and the robot ignored the set commands. The robot settings in the Xiaomi Home app could change it, so I set it to US Eastern there. The robot now reports America/New_York, and quiet hours run 10 PM to 8 AM Eastern.",
    "My app now checks the robot's time zone and can convert times if it ever drifts back, for example after another factory reset.",
    { type: "heading", text: "What my app does now" },
    "My app also tracks the robot's health now. It keeps a battery history, counts charge sessions and cycles, logs maintenance, and watches for reboots.",
    "It takes plain-English commands too, offline, from the CLI or an Ask box in the dashboard. Questions get an answer right away. Anything that moves the robot or changes a setting asks first.",
    "A publish command writes a sanitized snapshot, built from an allow-list of fields. That's the format the Robot Vacuum app in Lab OS reads.",
    { type: "heading", text: "What stays private" },
    "The code that controls the robot is private for now. This site only shows sanitized, read-only data: the Robot Vacuum app in Lab OS reads a status snapshot (battery, charging, consumables, and uptime) and has no controls.",
    { type: "heading", text: "What's next" },
    { type: "list", items: robotVacuumRoadmap }
  ]
};
