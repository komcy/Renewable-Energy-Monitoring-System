/**
 * Pure scoring rules for the Diagnostics Engine (no database access, so it is unit-testable).
 * Health index = 100 minus weighted penalties; failure probability is a logistic curve over it.
 */
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const round = (n, d = 1) => Math.round(n * 10 ** d) / 10 ** d;
const pct = (share) => round(share * 100);
/** Health at or below this is High risk (50% failure probability). Override with RISK_HIGH_BELOW, e.g. for demos. */
const HIGH_BELOW = Number(process.env.RISK_HIGH_BELOW) || 55;
const SEVERITY_WEIGHT = { Critical: 8, High: 4, Medium: 2, Low: 1 };

/**
 * @param {object} m { efficiency, recentEfficiency, priorEfficiency (percent|null), faultShare, degradedShare,
 *                     hotShare (0-1), openAlerts: { Critical, High, Medium, Low } }
 */
function scoreHealth(m) {
  const factors = [];
  const add = (key, label, penalty, detail) => {
    if (penalty > 0.05) factors.push({ key, label, penalty: round(penalty), detail });
  };

  if (m.efficiency != null) {
    add('efficiency', 'Low efficiency', clamp(85 - m.efficiency, 0, 40), `Averaging ${round(m.efficiency)}% of expected output over 30 days (healthy: 85% or more)`);
  }
  if (m.recentEfficiency != null && m.priorEfficiency != null) {
    const drop = m.priorEfficiency - m.recentEfficiency;
    add('trend', 'Declining performance', clamp(drop * 1.5, 0, 15), `Efficiency moved from ${round(m.priorEfficiency)}% to ${round(m.recentEfficiency)}% in the last 7 days`);
  }
  add(
    'faults',
    'Fault and degraded operation',
    clamp(m.faultShare * 100 * 0.6 + m.degradedShare * 100 * 0.25, 0, 25),
    `${pct(m.faultShare)}% of readings in Fault and ${pct(m.degradedShare)}% Degraded`,
  );
  const alertWeight = Object.entries(m.openAlerts ?? {}).reduce((sum, [sev, n]) => sum + (SEVERITY_WEIGHT[sev] ?? 0) * n, 0);
  add('alerts', 'Open alerts', clamp(alertWeight, 0, 20), `${Object.values(m.openAlerts ?? {}).reduce((a, b) => a + b, 0)} unresolved alert(s), weighted by severity`);
  add('temperature', 'Thermal stress', clamp(m.hotShare * 100 * 0.3, 0, 10), `${pct(m.hotShare)}% of readings above 90% of the temperature limit`);

  factors.sort((a, b) => b.penalty - a.penalty);
  const healthIndex = round(clamp(100 - factors.reduce((s, f) => s + f.penalty, 0), 0, 100));
  const failureProbability = round(1 / (1 + Math.exp((healthIndex - HIGH_BELOW) / 8)), 3);
  const riskLevel = healthIndex <= HIGH_BELOW ? 'High' : healthIndex <= HIGH_BELOW + 11 ? 'Medium' : 'Low';
  const trend =
    m.recentEfficiency == null || m.priorEfficiency == null
      ? 'Unknown'
      : m.recentEfficiency - m.priorEfficiency > 2
        ? 'Improving'
        : m.recentEfficiency - m.priorEfficiency < -2
          ? 'Declining'
          : 'Stable';
  return { healthIndex, failureProbability, riskLevel, trend, factors };
}

/** Maintenance suggestion for a scored asset; only High risk is scheduled automatically. */
function recommend(asset, result) {
  const top = result.factors.slice(0, 2).map((f) => f.label.toLowerCase()).join(' and ') || 'overall condition';
  if (result.riskLevel === 'High') {
    return {
      schedule: true,
      title: `Predictive: inspect ${asset.assetCode} (health ${result.healthIndex}/100)`,
      maintenanceType: 'Preventive',
      priority: result.healthIndex <= 40 ? 'Critical' : 'High',
      scheduleInDays: result.healthIndex <= 40 ? 1 : 3,
      description: `Auto-recommended by the diagnostics engine. Failure probability ${Math.round(result.failureProbability * 100)}%. Main drivers: ${top}.`,
    };
  }
  return {
    schedule: false,
    action: result.riskLevel === 'Medium' ? `Keep watching ${asset.assetCode}; plan an inspection at the next site visit (drivers: ${top}).` : 'No action needed.',
  };
}

/** Likely causes for an alert, ranked using the readings around it. */
function rankCauses(alertType, ctx) {
  const c = [];
  const push = (cause, likelihood, evidence) => c.push({ cause, likelihood, evidence });
  const lowSun = ctx.avgIrradiance != null && ctx.avgIrradiance < 200;
  const lowWind = ctx.avgWindSpeed != null && ctx.avgWindSpeed < 3;
  if (ctx.hotShare > 0.3 || alertType === 'OverTemperature') push('Thermal derating or cooling problem', ctx.hotShare > 0.3 ? 'High' : 'Medium', `${pct(ctx.hotShare)}% of nearby readings are near the temperature limit`);
  if (lowSun) push('Low sunlight (cloud cover or dusk)', 'High', `Average irradiance around the alert was ${round(ctx.avgIrradiance)} W/m²`);
  if (lowWind) push('Wind below cut-in speed', 'High', `Average wind speed around the alert was ${round(ctx.avgWindSpeed)} m/s`);
  if (ctx.faultShare > 0.2) push('Equipment fault (inverter trip or converter error)', 'High', `${pct(ctx.faultShare)}% of nearby readings reported Fault`);
  if (['OutputDrop', 'ZeroGeneration', 'LowEfficiency'].includes(alertType) && !lowSun && !lowWind) {
    push('Equipment issue: soiling, shading, or inverter/MPPT fault', 'Medium', 'Conditions were adequate, yet output stayed below expectation');
  }
  if (alertType === 'LowStateOfCharge') push('Battery under-charging or high load', 'Medium', 'State of charge fell below the configured minimum');
  if (!c.length) push('Cause not determined from available readings', 'Low', 'Inspect the asset on site');
  const rank = { High: 0, Medium: 1, Low: 2 };
  return c.sort((a, b) => rank[a.likelihood] - rank[b.likelihood]);
}

module.exports = { scoreHealth, recommend, rankCauses };
