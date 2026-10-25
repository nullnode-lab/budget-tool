/*
 * Paycheck & tax estimator for a single filer living in Pennsylvania.
 *
 * Figures are for tax year 2026:
 *  - Federal brackets & standard deduction: IRS Rev. Proc. 2025-32 (Oct 2025)
 *  - Social Security wage base: SSA 2026 COLA release ($184,500)
 *  - 401(k) / IRA limits: IRS Notice 2025-67 ($24,500 / $7,500)
 *  - PA personal income tax: flat 3.07% (no standard deduction, 401(k)
 *    contributions are NOT deductible for PA)
 *  - PA unemployment compensation (UC) employee withholding: 0.07% of all wages
 *  - Local Earned Income Tax (EIT, Act 32) and Local Services Tax (LST, max $52)
 *
 * This is an estimate for budgeting, not tax advice. Actual withholding depends
 * on your W-4, your employer's payroll system and your exact municipality.
 */
(function (root) {
  'use strict';

  var TAX = {
    year: 2026,
    federal: {
      standardDeduction: 16100,
      // [upper bound of bracket, rate] for single filers
      brackets: [
        [12400, 0.10],
        [50400, 0.12],
        [105700, 0.22],
        [201775, 0.24],
        [256225, 0.32],
        [640600, 0.35],
        [Infinity, 0.37]
      ]
    },
    fica: {
      ssRate: 0.062,
      ssWageBase: 184500,
      medicareRate: 0.0145,
      addlMedicareRate: 0.009,
      addlMedicareThreshold: 200000
    },
    pa: {
      rate: 0.0307,
      ucEmployeeRate: 0.0007,
      // Tax Forgiveness (Schedule SP), single filer with no dependents:
      // 100% forgiven at or below $6,500 of eligibility income, then 10%
      // less forgiveness for each additional $250.
      forgivenessBase: 6500,
      forgivenessStep: 250
    },
    local: {
      lstMax: 52,
      lstExemptBelow: 12000
    },
    limits: {
      k401: 24500,
      ira: 7500
    }
  };

  // Common municipalities with an "East Stroudsburg, PA 18301" mailing address.
  // Resident EIT rates per PA DCED municipal statistics (verify yours with DCED's
  // "PSD Codes and EIT Rates" lookup on dced.pa.gov). LST is charged where you WORK.
  var LOCAL_PRESETS = [
    { id: 'es-borough', name: 'East Stroudsburg Borough', psd: '450101', eit: 1.0, lst: 52 },
    { id: 'stroud-twp', name: 'Stroud Township', psd: '450403', eit: 1.25, lst: 52 },
    { id: 'smithfield-twp', name: 'Smithfield Township', psd: '450104', eit: 1.0, lst: 52 },
    { id: 'middle-smithfield-twp', name: 'Middle Smithfield Township', psd: '450102', eit: 1.0, lst: 52 },
    { id: 'price-twp', name: 'Price Township', psd: '450103', eit: 1.0, lst: 10 },
    { id: 'stroudsburg-borough', name: 'Stroudsburg Borough', psd: '450404', eit: 1.0, lst: 52 },
    { id: 'custom', name: 'Other / custom rate', psd: '', eit: null, lst: null }
  ];

  function num(v) {
    var n = Number(v);
    return isFinite(n) ? n : 0;
  }

  function federalIncomeTax(taxableIncome) {
    var tax = 0;
    var lower = 0;
    var marginal = TAX.federal.brackets[0][1];
    var brackets = TAX.federal.brackets;
    for (var i = 0; i < brackets.length; i++) {
      var upper = brackets[i][0];
      var rate = brackets[i][1];
      if (taxableIncome > lower) {
        tax += (Math.min(taxableIncome, upper) - lower) * rate;
        marginal = rate;
      }
      lower = upper;
    }
    return { tax: tax, marginal: taxableIncome > 0 ? marginal : 0 };
  }

  function paForgivenessPct(eligibilityIncome) {
    var base = TAX.pa.forgivenessBase;
    if (eligibilityIncome <= base) return 1;
    var steps = Math.ceil((eligibilityIncome - base) / TAX.pa.forgivenessStep);
    return Math.max(0, 1 - steps * 0.1);
  }

  /*
   * opts: {
   *   gross          annual gross pay
   *   k401Pct        employee 401(k) contribution, % of gross
   *   k401Type       'traditional' (pre-tax) | 'roth' (after-tax)
   *   matchPct       employer matches 100% up to this % of gross
   *   healthAnnual   pre-tax (Section 125) health/dental/vision premiums per year
   *   eitRate        local earned income tax rate, in percent (e.g. 1.0)
   *   lstEnabled     whether a Local Services Tax applies
   *   lstAmount      LST per year (capped at $52)
   *   paForgiveness  apply PA Tax Forgiveness (single, not claimed as a dependent)
   * }
   * Returns annual amounts.
   */
  function estimatePaycheck(opts) {
    var gross = Math.max(0, num(opts.gross));
    var k401Pct = Math.min(100, Math.max(0, num(opts.k401Pct)));
    var k401 = Math.min(gross * k401Pct / 100, TAX.limits.k401);
    var health = Math.min(Math.max(0, num(opts.healthAnnual)), Math.max(0, gross - k401));
    var traditional = opts.k401Type !== 'roth';

    // Section 125 premiums come out before federal, FICA, PA and local tax.
    // Traditional 401(k) only lowers FEDERAL taxable wages.
    var federalWages = Math.max(0, gross - health - (traditional ? k401 : 0));
    var taxableIncome = Math.max(0, federalWages - TAX.federal.standardDeduction);
    var fed = federalIncomeTax(taxableIncome);

    var ficaWages = Math.max(0, gross - health);
    var socialSecurity = Math.min(ficaWages, TAX.fica.ssWageBase) * TAX.fica.ssRate;
    var medicare = ficaWages * TAX.fica.medicareRate +
      Math.max(0, ficaWages - TAX.fica.addlMedicareThreshold) * TAX.fica.addlMedicareRate;

    var paWages = Math.max(0, gross - health);
    var paTax = paWages * TAX.pa.rate;
    var forgiven = 0;
    if (opts.paForgiveness) {
      forgiven = paTax * paForgivenessPct(paWages);
      paTax -= forgiven;
    }

    var eitRate = Math.max(0, num(opts.eitRate)) / 100;
    var localEit = paWages * eitRate;

    var lst = 0;
    if (opts.lstEnabled && gross >= TAX.local.lstExemptBelow) {
      lst = Math.min(Math.max(0, num(opts.lstAmount)), TAX.local.lstMax);
    }
    if (lst > gross) lst = gross;

    var paUC = gross * TAX.pa.ucEmployeeRate;

    var totalTax = fed.tax + socialSecurity + medicare + paTax + localEit + lst + paUC;
    var takeHome = Math.max(0, gross - totalTax - k401 - health);

    var matchPct = Math.max(0, num(opts.matchPct));
    var employerMatch = gross * Math.min(k401Pct, matchPct) / 100;
    var missedMatch = gross * Math.max(0, matchPct - k401Pct) / 100;

    // Share of the next dollar earned that goes to tax.
    var ssMarginal = ficaWages < TAX.fica.ssWageBase ? TAX.fica.ssRate : 0;
    var medMarginal = TAX.fica.medicareRate +
      (ficaWages > TAX.fica.addlMedicareThreshold ? TAX.fica.addlMedicareRate : 0);
    var nextFed = federalWages + 1 > TAX.federal.standardDeduction
      ? federalIncomeTax(Math.max(taxableIncome, 1)).marginal : 0;
    var marginalRate = gross > 0
      ? nextFed + ssMarginal + medMarginal + TAX.pa.rate + eitRate + TAX.pa.ucEmployeeRate
      : 0;

    return {
      gross: gross,
      federalWages: federalWages,
      taxableIncome: taxableIncome,
      federalTax: fed.tax,
      federalMarginal: fed.marginal,
      socialSecurity: socialSecurity,
      medicare: medicare,
      paTax: paTax,
      paForgiven: forgiven,
      localEit: localEit,
      lst: lst,
      paUC: paUC,
      k401: k401,
      k401Type: traditional ? 'traditional' : 'roth',
      health: health,
      totalTax: totalTax,
      takeHome: takeHome,
      effectiveTaxRate: gross > 0 ? totalTax / gross : 0,
      marginalRate: marginalRate,
      employerMatch: employerMatch,
      missedMatch: missedMatch
    };
  }

  function annualGross(income) {
    if (!income) return 0;
    if (income.type === 'hourly') {
      return Math.max(0, num(income.hourly)) * Math.max(0, num(income.hours)) * 52;
    }
    return Math.max(0, num(income.salary));
  }

  var api = {
    TAX: TAX,
    LOCAL_PRESETS: LOCAL_PRESETS,
    federalIncomeTax: federalIncomeTax,
    paForgivenessPct: paForgivenessPct,
    estimatePaycheck: estimatePaycheck,
    annualGross: annualGross
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.BudgetTax = api;
  }
})(typeof window !== 'undefined' ? window : this);
