const endpoint = "https://api.github.com/graphql";
const username = process.env.GITHUB_USER_NAME;
const token = process.env.GITHUB_TOKEN;
const outputDirectory = process.env.OUTPUT_DIRECTORY || "dist";

if (!username || !token) {
  throw new Error("GITHUB_USER_NAME and GITHUB_TOKEN are required");
}

const query = `
  query ContributionCalendar($login: String!) {
    user(login: $login) {
      contributionsCollection {
        contributionCalendar {
          totalContributions
          weeks {
            contributionDays {
              date
              contributionCount
              contributionLevel
            }
          }
        }
      }
    }
  }
`;

const response = await fetch(endpoint, {
  method: "POST",
  headers: {
    Accept: "application/vnd.github+json",
    Authorization: `bearer ${token}`,
    "Content-Type": "application/json",
    "User-Agent": "zsoci1-profile-snake",
  },
  body: JSON.stringify({ query, variables: { login: username } }),
});

if (!response.ok) {
  throw new Error(`GitHub GraphQL request failed with HTTP ${response.status}`);
}

const payload = await response.json();
if (payload.errors?.length) {
  throw new Error(payload.errors.map((error) => error.message).join("; "));
}

const calendar = payload.data?.user?.contributionsCollection?.contributionCalendar;
if (!calendar) {
  throw new Error(`GitHub user "${username}" was not found`);
}

const days = calendar.weeks.flatMap((week) => week.contributionDays);
const totalContributions = calendar.totalContributions;
const currentStreak = calculateCurrentStreak(days);
const longestStreak = calculateLongestStreak(days);
const pace = (totalContributions / days.length).toFixed(1);
const level = Math.max(1, Math.floor(totalContributions / 250) + 1);
const score = totalContributions * 10 + longestStreak * 25;

await import("node:fs/promises").then(({ mkdir, writeFile }) =>
  mkdir(outputDirectory, { recursive: true }).then(async () => {
    await writeFile(`${outputDirectory}/snake.svg`, renderSvg(days, {
      currentStreak,
      longestStreak,
      level,
      pace,
      score,
      theme: "light",
      totalContributions,
      username,
    }));
    await writeFile(`${outputDirectory}/snake-dark.svg`, renderSvg(days, {
      currentStreak,
      longestStreak,
      level,
      pace,
      score,
      theme: "dark",
      totalContributions,
      username,
    }));
  }),
);

function calculateCurrentStreak(contributionDays) {
  let streak = 0;
  for (let index = contributionDays.length - 1; index >= 0; index -= 1) {
    if (contributionDays[index].contributionCount === 0) break;
    streak += 1;
  }
  return streak;
}

function calculateLongestStreak(contributionDays) {
  let longest = 0;
  let current = 0;
  for (const day of contributionDays) {
    current = day.contributionCount > 0 ? current + 1 : 0;
    longest = Math.max(longest, current);
  }
  return longest;
}

function renderSvg(contributionDays, stats) {
  const dark = stats.theme === "dark";
  const colors = dark
    ? { background: "#0d1117", text: "#e6edf3", muted: "#7d8590", border: "#21262d" }
    : { background: "#ffffff", text: "#1f2328", muted: "#656d76", border: "#d0d7de" };
  const graphColors = dark
    ? ["#161b22", "#0e4429", "#006d32", "#26a641", "#39d353"]
    : ["#ebedf0", "#9be9a8", "#40c463", "#30a14e", "#216e39"];
  const graph = contributionDays.map((day, index) => {
    const column = Math.floor(index / 7);
    const row = index % 7;
    const levelIndex = ["NONE", "FIRST_QUARTILE", "SECOND_QUARTILE", "THIRD_QUARTILE", "FOURTH_QUARTILE"]
      .indexOf(day.contributionLevel);
    return `<rect x="${72 + column * 19.7}" y="${132 + row * 19.7}" width="16.5" height="16.5" rx="3" fill="${graphColors[Math.max(0, levelIndex)]}"/>`;
  }).join("");
  const snakePath = buildSnakePath(contributionDays.length);
  const safeUser = escapeXml(stats.username);

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 420" role="img" aria-labelledby="title description">
<title id="title">Contribution snake for ${safeUser}</title>
<desc id="description">${totalContributionsDescription(stats.totalContributions)} with a current streak of ${stats.currentStreak} days and a longest streak of ${stats.longestStreak} days.</desc>
<defs>
  <linearGradient id="snake-head" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#c4b5fd"/><stop offset="1" stop-color="#8b5cf6"/></linearGradient>
</defs>
<rect width="1200" height="420" fill="${colors.background}"/>
<text x="72" y="72" font-family="system-ui, sans-serif" font-size="26" font-weight="700" fill="${colors.text}">contribution snake</text>
<text x="72" y="98" font-family="ui-monospace, monospace" font-size="11" fill="${colors.muted}" letter-spacing="3.5">EATING SQUARES · REBUILT EVERY MIDNIGHT UTC</text>
<text x="1128" y="68" text-anchor="end" font-family="ui-monospace, monospace" font-size="10" fill="#39d353" letter-spacing="2.5">LIVE</text>
<g>${graph}</g>
<g fill="none" stroke="#a78bfa" stroke-width="4" stroke-linecap="round" opacity="0.85">
  <path d="${snakePath}" stroke-dasharray="12 10"><animate attributeName="stroke-dashoffset" from="0" to="-22" dur="1.1s" repeatCount="indefinite"/></path>
</g>
<line x1="72" y1="300" x2="1128" y2="300" stroke="${colors.border}" stroke-width="1"/>
${metric(72, "SCORE", formatNumber(stats.score), colors.text)}
${metric(283, "STREAK", `${stats.currentStreak}d`, "#39d353")}
${metric(494, "LONGEST", `${stats.longestStreak}d`, colors.text)}
${metric(705, "PACE", `${stats.pace}/day`, colors.text)}
${metric(916, "LEVEL", stats.level, "#a78bfa")}
<text x="72" y="398" font-family="ui-monospace, monospace" font-size="10" fill="${colors.muted}" letter-spacing="2">LAST 12 MONTHS · ${formatNumber(stats.totalContributions)} CONTRIBUTIONS · GENERATED BY YOUR PROFILE</text>
</svg>`;
}

function metric(x, label, value, color) {
  return `<text x="${x}" y="328" font-family="ui-monospace, monospace" font-size="9.5" fill="#7d8590" letter-spacing="3">${label}</text><text x="${x}" y="360" font-family="ui-monospace, monospace" font-size="26" font-weight="700" fill="${color}">${value}</text>`;
}

function buildSnakePath(dayCount) {
  const columns = Math.min(53, Math.ceil(dayCount / 7));
  const points = [];
  for (let column = 0; column < columns; column += 1) {
    const x = 80 + column * 19.7;
    points.push(`${x},${column % 2 === 0 ? 140 : 265}`);
  }
  return `M ${points.join(" L ")}`;
}

function formatNumber(value) {
  return Number(value).toLocaleString("en-US");
}

function totalContributionsDescription(value) {
  return `${formatNumber(value)} contributions in the last year`;
}

function escapeXml(value) {
  return value.replace(/[<>&'"]/g, (character) => ({
    "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;",
  }[character]));
}
