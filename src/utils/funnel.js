/**
 * Recruiting Funnel Calculator
 * Calculates required outreach based on conversion rates and hire targets
 */

// Default conversion rates (can be customized per role)
export const DEFAULT_RATES = {
  responseRate: 0.15,      // 15% of outreach responds
  interestRate: 0.60,      // 60% of responses are interested
  screenRate: 0.80,        // 80% of interested schedule screens
  passThrough: 0.25,       // 25% of screens advance to next round
  offerRate: 0.50,         // 50% of finals get offers
  acceptRate: 0.80         // 80% of offers accept
};

/**
 * Calculate required outreach to hit hire target
 */
export function calculateRequiredOutreach(hireTarget, rates = DEFAULT_RATES) {
  const { responseRate, interestRate, screenRate, passThrough, offerRate, acceptRate } = rates;

  // Work backwards from hires
  const offersNeeded = Math.ceil(hireTarget / acceptRate);
  const finalsNeeded = Math.ceil(offersNeeded / offerRate);
  const screensNeeded = Math.ceil(finalsNeeded / passThrough);
  const interestedNeeded = Math.ceil(screensNeeded / screenRate);
  const responsesNeeded = Math.ceil(interestedNeeded / interestRate);
  const outreachNeeded = Math.ceil(responsesNeeded / responseRate);

  return {
    hires: hireTarget,
    offers: offersNeeded,
    finals: finalsNeeded,
    screens: screensNeeded,
    interested: interestedNeeded,
    responses: responsesNeeded,
    outreach: outreachNeeded
  };
}

/**
 * Calculate weekly breakdown from monthly targets
 */
export function calculateWeeklyTargets(monthlyOutreach, weeksInMonth = 4) {
  const weeklyOutreach = Math.ceil(monthlyOutreach / weeksInMonth);
  const dailyOutreach = Math.ceil(weeklyOutreach / 5); // Assuming 5 working days

  return {
    monthly: monthlyOutreach,
    weekly: weeklyOutreach,
    daily: dailyOutreach
  };
}

/**
 * Calculate outreach distribution across roles based on pass-through rates
 * Roles with higher pass-through rates should get proportionally more focus
 */
export function calculateOutreachDistribution(roles) {
  // Calculate efficiency score for each role (higher pass-through = more efficient)
  const rolesWithScores = roles.map(role => {
    const rates = role.conversionRates || DEFAULT_RATES;
    // Overall conversion: outreach to hire
    const overallConversion =
      rates.responseRate *
      rates.interestRate *
      rates.screenRate *
      rates.passThrough *
      rates.offerRate *
      rates.acceptRate;

    return {
      ...role,
      efficiency: overallConversion,
      // Weight by both efficiency and hire target
      weightedScore: overallConversion * (role.monthlyHireTarget || 1)
    };
  });

  const totalScore = rolesWithScores.reduce((sum, r) => sum + r.weightedScore, 0);

  return rolesWithScores.map(role => ({
    ...role,
    distributionPercent: totalScore > 0 ? Math.round((role.weightedScore / totalScore) * 100) : 0
  }));
}

/**
 * Get current week number in the month (1-5)
 */
export function getCurrentWeekOfMonth() {
  const now = new Date();
  const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
  const dayOfMonth = now.getDate();
  return Math.ceil(dayOfMonth / 7);
}

/**
 * Get weeks remaining in the month
 */
export function getWeeksRemainingInMonth() {
  const now = new Date();
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const daysRemaining = lastDay.getDate() - now.getDate();
  return Math.ceil(daysRemaining / 7) || 1;
}

/**
 * Get days remaining in current week (work days only, Mon-Fri)
 */
export function getWorkDaysRemainingInWeek() {
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0 = Sunday, 6 = Saturday

  if (dayOfWeek === 0) return 5; // Sunday -> full week ahead
  if (dayOfWeek === 6) return 5; // Saturday -> full week ahead
  return 5 - dayOfWeek; // Mon=1, so 5-1=4 days remaining
}

/**
 * Calculate progress to plan
 */
export function calculateProgressToPlan(current, target, daysElapsed, totalDays) {
  const expectedProgress = (daysElapsed / totalDays) * target;
  const variance = current - expectedProgress;
  const variancePercent = expectedProgress > 0 ? (variance / expectedProgress) * 100 : 0;

  return {
    current,
    target,
    expected: Math.round(expectedProgress),
    variance: Math.round(variance),
    variancePercent: Math.round(variancePercent),
    status: variance >= 0 ? 'ahead' : 'behind',
    onTrack: variance >= -expectedProgress * 0.1 // Within 10% is "on track"
  };
}

/**
 * Generate morning briefing data
 */
export function generateMorningBriefing(roles, currentScreenings, monthlyProgress) {
  const today = new Date();
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const dayName = dayNames[today.getDay()];

  const briefing = {
    greeting: `Good morning! It's ${dayName}.`,
    todaysFocus: [],
    screeningsToday: 0,
    outreachTargets: [],
    motivation: ''
  };

  roles.forEach(role => {
    const funnel = calculateRequiredOutreach(role.monthlyHireTarget || 1, role.conversionRates || DEFAULT_RATES);
    const weeklyTargets = calculateWeeklyTargets(funnel.outreach);
    const workDaysLeft = getWorkDaysRemainingInWeek();

    // Calculate today's outreach target
    const weeklyOutreachDone = role.weeklyOutreachDone || 0;
    const weeklyOutreachRemaining = Math.max(0, weeklyTargets.weekly - weeklyOutreachDone);
    const todayOutreach = workDaysLeft > 0 ? Math.ceil(weeklyOutreachRemaining / workDaysLeft) : 0;

    briefing.outreachTargets.push({
      role: role.name,
      outreach: todayOutreach,
      screensScheduled: currentScreenings[role.name] || 0
    });
  });

  // Set motivation based on progress
  if (monthlyProgress.variancePercent >= 10) {
    briefing.motivation = "You're ahead of pace! Keep the momentum going.";
  } else if (monthlyProgress.variancePercent >= 0) {
    briefing.motivation = "Right on track. Consistency is key!";
  } else if (monthlyProgress.variancePercent >= -10) {
    briefing.motivation = "Slightly behind - a strong day can get you back on track.";
  } else {
    briefing.motivation = "Time to pick up the pace. Focus on high-conversion roles today.";
  }

  return briefing;
}

/**
 * Generate weekly report
 */
export function generateWeeklyReport(roles, weeklyData) {
  const report = {
    weekOf: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    totalScreens: 0,
    totalOutreach: 0,
    byRole: [],
    topPerformer: null,
    needsAttention: null,
    nextWeekFocus: []
  };

  roles.forEach(role => {
    const roleData = weeklyData[role.name] || { screens: 0, outreach: 0 };
    const funnel = calculateRequiredOutreach(role.monthlyHireTarget || 1, role.conversionRates || DEFAULT_RATES);
    const weeklyTargets = calculateWeeklyTargets(funnel.outreach);

    const roleReport = {
      name: role.name,
      screens: roleData.screens,
      screenTarget: Math.ceil(funnel.screens / 4),
      outreach: roleData.outreach,
      outreachTarget: weeklyTargets.weekly,
      percentComplete: weeklyTargets.weekly > 0 ? Math.round((roleData.outreach / weeklyTargets.weekly) * 100) : 0
    };

    report.byRole.push(roleReport);
    report.totalScreens += roleData.screens;
    report.totalOutreach += roleData.outreach;
  });

  // Find top performer and needs attention
  const sorted = [...report.byRole].sort((a, b) => b.percentComplete - a.percentComplete);
  report.topPerformer = sorted[0];
  report.needsAttention = sorted[sorted.length - 1];

  // Generate next week focus based on efficiency
  const distribution = calculateOutreachDistribution(roles);
  report.nextWeekFocus = distribution
    .sort((a, b) => b.distributionPercent - a.distributionPercent)
    .slice(0, 3)
    .map(r => ({ name: r.name, percent: r.distributionPercent }));

  return report;
}

/**
 * Generate Sunday outreach plan
 */
export function generateSundayPlan(roles, monthlyProgress) {
  const plan = {
    totalOutreach: 0,
    byRole: [],
    rationale: ''
  };

  const distribution = calculateOutreachDistribution(roles);
  const weeksRemaining = getWeeksRemainingInMonth();

  // Calculate total outreach needed to catch up or stay on track
  let totalNeeded = 0;
  roles.forEach(role => {
    const funnel = calculateRequiredOutreach(role.monthlyHireTarget || 1, role.conversionRates || DEFAULT_RATES);
    const monthlyOutreach = funnel.outreach;
    const outreachDone = role.monthlyOutreachDone || 0;
    const remaining = Math.max(0, monthlyOutreach - outreachDone);
    totalNeeded += Math.ceil(remaining / weeksRemaining);
  });

  plan.totalOutreach = totalNeeded;

  // Distribute based on efficiency
  distribution.forEach(role => {
    const roleOutreach = Math.round((role.distributionPercent / 100) * totalNeeded);
    plan.byRole.push({
      name: role.name,
      outreach: roleOutreach,
      percent: role.distributionPercent,
      efficiency: (role.efficiency * 100).toFixed(2) + '%'
    });
  });

  // Generate rationale
  const topRole = distribution[0];
  if (topRole) {
    plan.rationale = `Focus ${topRole.distributionPercent}% on ${topRole.name} due to higher conversion efficiency.`;
  }

  return plan;
}
