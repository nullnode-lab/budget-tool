/*
 * Smart defaults for a recent graduate living with their parents.
 *
 * Every percentage is a share of TAKE-HOME pay (what lands in your bank
 * account after taxes, 401(k) and pre-tax insurance). Ranges are the
 * recommended band for someone with very low housing costs, so more of each
 * paycheck can go toward savings and debt payoff.
 *
 * Item types:
 *   need - essentials you can't easily skip
 *   want - lifestyle spending you control
 *   save - money set aside for your future self
 *   debt - loan payments
 */
(function (root) {
  'use strict';

  var CATEGORIES = [
    {
      id: 'parents',
      name: 'Parental Contribution',
      emoji: '🏡',
      slot: 1,
      enabled: true,
      range: [10, 20],
      blurb: 'Paying your parents a set share every payday builds the habit of paying for housing, ' +
        'while still costing far less than an apartment. For adult children living at home, 10–20% of ' +
        'take-home pay is a fair, common range: enough to cover the extra food, utilities and wear you ' +
        'add to the household, low enough that you can still save aggressively. Agree on the number together.',
      items: [
        {
          id: 'parents-rent', name: 'Rent / mortgage share', type: 'need', enabled: true,
          mode: 'pct', pct: 10, annual: 0, range: [7, 14],
          tip: 'Agree on an amount with your parents, write it down, and pay it on the same day every ' +
            'month like real rent. It is great practice for when you move out.'
        },
        {
          id: 'parents-util', name: 'Utilities & household share', type: 'need', enabled: true,
          mode: 'pct', pct: 5, annual: 0, range: [3, 6],
          tip: 'Your share of electric, heat, water, internet and household supplies. One idea: take over ' +
            'one specific bill (like internet) so you practice paying a bill on time.'
        }
      ]
    },
    {
      id: 'housing',
      name: 'Future Rent / Mortgage',
      emoji: '🔑',
      slot: 2,
      enabled: false,
      range: [25, 35],
      blurb: 'Off while you live at home. When you move out, switch this on and switch Parental ' +
        'Contribution off. A common target is keeping rent plus utilities at or under about 30–35% of ' +
        'take-home pay (or roughly 30% of gross pay).',
      items: [
        {
          id: 'housing-rent', name: 'Rent or mortgage payment', type: 'need', enabled: true,
          mode: 'pct', pct: 25, annual: 0, range: [20, 30],
          tip: 'The classic guideline is rent at or below ~30% of gross income. For buying, lenders ' +
            'use the "28% rule": total housing payment at or below 28% of gross income.'
        },
        {
          id: 'housing-util', name: 'Utilities & internet', type: 'need', enabled: true,
          mode: 'pct', pct: 5, annual: 0, range: [3, 7],
          tip: 'Electric, heat, water/sewer, trash and internet. Ask the landlord what utilities ' +
            'usually cost per month before you sign a lease.'
        },
        {
          id: 'housing-ins', name: "Renter's insurance", type: 'need', enabled: true,
          mode: 'fixed', pct: 0, annual: 180, range: [0.3, 1],
          tip: 'Usually $10–$20 a month. It covers your belongings (theft, fire) and liability, and ' +
            'many landlords require it.'
        }
      ]
    },
    {
      id: 'car',
      name: 'Car & Transportation',
      emoji: '🚗',
      slot: 3,
      enabled: true,
      range: [10, 20],
      blurb: 'Keep total car costs (payment + insurance + gas + upkeep) at or below about 15–20% of ' +
        'take-home pay. Living at home is the perfect time to save a big down payment, so your ' +
        'future loan is small or you can skip the loan entirely.',
      items: [
        {
          id: 'car-down', name: 'Car down-payment fund', type: 'save', enabled: true,
          mode: 'pct', pct: 8, annual: 0, range: [5, 12],
          tip: 'Follow the 20/4/10 rule: at least 20% down, a loan of 4 years or less, and total car ' +
            'costs under 10% of gross income. This line feeds your "Car down payment" goal.'
        },
        {
          id: 'car-payment', name: 'Car loan payment (future)', type: 'debt', enabled: false,
          mode: 'pct', pct: 10, annual: 0, range: [0, 10],
          tip: 'Turn this on when you buy. Keep the payment at or below ~10% of take-home pay. A ' +
            'reliable used car with a short loan usually beats a new car with a long one.'
        },
        {
          id: 'car-ins', name: 'Car insurance', type: 'need', enabled: true,
          mode: 'pct', pct: 4, annual: 0, range: [2, 6],
          tip: 'Staying on your parents\' policy as a listed driver at their address is often much ' +
            'cheaper than your own policy. Get new quotes once a year and ask about safe-driver discounts.'
        },
        {
          id: 'car-gas', name: 'Gas, tolls & parking', type: 'need', enabled: true,
          mode: 'pct', pct: 3, annual: 0, range: [2, 5],
          tip: 'Commuting cost depends heavily on where you get hired. Recalculate once you know your ' +
            'commute (miles per day ÷ your car\'s MPG × price per gallon × workdays).'
        },
        {
          id: 'car-maint', name: 'Maintenance, inspection & registration', type: 'need', enabled: true,
          mode: 'pct', pct: 2, annual: 0, range: [1, 3],
          tip: 'PA requires an annual safety inspection and registration renewal. Setting money aside ' +
            'for oil changes, tires and repairs keeps them from becoming emergencies.'
        }
      ]
    },
    {
      id: 'loans',
      name: 'Student Loans',
      emoji: '🎓',
      slot: 4,
      enabled: true,
      range: [5, 15],
      blurb: 'Always pay at least the minimum on time: late payments hurt your credit score. Federal ' +
        'loans usually have a 6-month grace period after graduation. Look up your servicer and exact ' +
        'payment at studentaid.gov, then enter the real amount here.',
      items: [
        {
          id: 'loans-min', name: 'Required monthly payment', type: 'debt', enabled: true,
          mode: 'pct', pct: 8, annual: 0, range: [5, 12],
          tip: 'Placeholder estimate. Once you know your real payment, click "$" so it stays a fixed ' +
            'dollar amount and type it in. If payments feel unaffordable, ask your servicer about ' +
            'income-driven repayment instead of skipping a payment.'
        },
        {
          id: 'loans-extra', name: 'Extra payments (optional)', type: 'debt', enabled: false,
          mode: 'pct', pct: 4, annual: 0, range: [0, 10],
          tip: 'Worth it for loans above ~6–7% interest. For low-rate loans (under ~4–5%), investing ' +
            'the extra usually comes out ahead. Tell your servicer to apply extra to the highest-rate loan.'
        }
      ]
    },
    {
      id: 'living',
      name: 'General Living',
      emoji: '🛒',
      slot: 5,
      enabled: true,
      range: [12, 22],
      blurb: 'Day-to-day spending. Living at home keeps this low; it is also where "lifestyle creep" ' +
        'sneaks in, so track what you actually spend for the first 2–3 months and adjust.',
      items: [
        {
          id: 'living-groceries', name: 'Groceries & household', type: 'need', enabled: true,
          mode: 'pct', pct: 5, annual: 0, range: [3, 8],
          tip: 'Your own food plus anything you buy for the house. If your parents cover most groceries, ' +
            'shift some of this to savings or to your household contribution.'
        },
        {
          id: 'living-phone', name: 'Phone', type: 'need', enabled: true,
          mode: 'pct', pct: 2, annual: 0, range: [1, 3],
          tip: 'Staying on a family plan and paying your share is usually cheapest. Prepaid carriers are ' +
            'a low-cost alternative if you need your own line.'
        },
        {
          id: 'living-subs', name: 'Subscriptions (streaming, music, apps)', type: 'want', enabled: true,
          mode: 'pct', pct: 1, annual: 0, range: [0.5, 2],
          tip: 'Review these every few months and cancel anything you haven\'t used in 30 days. Student ' +
            'discounts often end after graduation, so watch for price jumps.'
        },
        {
          id: 'living-dining', name: 'Dining out & coffee', type: 'want', enabled: true,
          mode: 'pct', pct: 4, annual: 0, range: [2, 6],
          tip: 'Usually the easiest line to overspend. Paying with a debit card or a separate "fun" ' +
            'account makes the limit real.'
        },
        {
          id: 'living-fun', name: 'Entertainment & hobbies', type: 'want', enabled: true,
          mode: 'pct', pct: 4, annual: 0, range: [2, 6],
          tip: 'Budgeting for fun is healthy: a plan with zero fun money rarely lasts.'
        },
        {
          id: 'living-personal', name: 'Clothing & personal care', type: 'want', enabled: true,
          mode: 'pct', pct: 3, annual: 0, range: [1, 4],
          tip: 'Haircuts, toiletries, gym and work clothes for your new job.'
        },
        {
          id: 'living-buffer', name: 'Miscellaneous buffer', type: 'want', enabled: true,
          mode: 'pct', pct: 2, annual: 0, range: [1, 3],
          tip: 'For the things nobody remembers to budget (gifts, a copay, a parking ticket). Whatever is ' +
            'left at the end of the month goes to savings.'
        }
      ]
    },
    {
      id: 'savings',
      name: 'Aggressive Savings & Investing',
      emoji: '🚀',
      slot: 6,
      enabled: true,
      range: [30, 50],
      blurb: 'Your biggest advantage right now is low living costs. Every dollar invested in your 20s has ' +
        'decades to compound. Order of priority: starter emergency fund → employer 401(k) match → full ' +
        'emergency fund → Roth IRA → big goals (car, apartment) → extra investing.',
      items: [
        {
          id: 'save-emergency', name: 'Emergency fund (high-yield savings)', type: 'save', enabled: true,
          mode: 'pct', pct: 12, annual: 0, range: [8, 15],
          tip: 'Build 3–6 months of essential expenses in an FDIC-insured high-yield savings account ' +
            '(HYSA). It is insurance against a job loss or big repair, not an investment. This line feeds ' +
            'your "Emergency fund" goal.'
        },
        {
          id: 'save-roth', name: 'Roth IRA', type: 'save', enabled: true,
          mode: 'pct', pct: 10, annual: 0, range: [5, 15],
          tip: 'You pay tax now and withdrawals in retirement are tax-free. Your tax rate is low early in ' +
            'your career, which is exactly when a Roth shines. 2026 limit: $7,500 per year. Open one at a ' +
            'low-cost brokerage and choose a broad index fund or a target-date fund.'
        },
        {
          id: 'save-moveout', name: 'First apartment fund', type: 'save', enabled: true,
          mode: 'pct', pct: 8, annual: 0, range: [5, 12],
          tip: 'For move-out costs: security deposit, first month\'s rent, moving and basic furniture. ' +
            'This line feeds your "First apartment" goal.'
        },
        {
          id: 'save-invest', name: 'Index-fund investing (brokerage)', type: 'save', enabled: true,
          mode: 'pct', pct: 9, annual: 0, range: [0, 15],
          tip: 'Once the emergency fund and Roth IRA are on track, invest extra in a low-cost, ' +
            'diversified index fund (such as a total-market fund). Only invest money you won\'t need ' +
            'for at least 5 years.'
        }
      ]
    }
  ];

  var GOALS = [
    {
      id: 'goal-emergency', name: 'Emergency fund', emoji: '🛟', kind: 'emergency',
      target: 6000, saved: 0, linkedItemId: 'save-emergency', manualMonthly: 0, targetDate: ''
    },
    {
      id: 'goal-car', name: 'Car down payment', emoji: '🚗', kind: 'car',
      target: 4000, saved: 0, linkedItemId: 'car-down', manualMonthly: 0, targetDate: ''
    },
    {
      id: 'goal-apartment', name: 'First apartment', emoji: '🔑', kind: 'apartment',
      target: 5000, saved: 0, linkedItemId: 'save-moveout', manualMonthly: 0, targetDate: ''
    }
  ];

  // Shares of take-home pay, adapted from the 50/30/20 rule for someone with
  // very low housing costs.
  var MIX_TARGETS = {
    need: { max: 35, label: 'Needs', hint: 'at most 35%' },
    want: { max: 20, label: 'Wants', hint: 'at most 20%' },
    saveDebt: { min: 45, label: 'Savings & debt payoff', hint: 'at least 45%' }
  };

  var CHECKLIST = [
    {
      group: 'Foundations',
      steps: [
        { id: 'track', title: 'Track every dollar for your first 2–3 months',
          body: 'Compare what you actually spend with this plan, then adjust the sliders. Budgets get accurate with real data.' },
        { id: 'hysa', title: 'Open a high-yield savings account (HYSA)',
          body: 'Online banks pay far more interest than a typical checking account. Make sure it is FDIC-insured.' },
        { id: 'autopay', title: 'Automate it: set up transfers for payday',
          body: 'Have savings, your parental contribution and loan payments move automatically the day you get paid. What you never see, you never spend.' },
        { id: 'credit', title: 'Check your credit report (free)',
          body: 'Use annualcreditreport.com. Pay every bill on time and, if you use a credit card, pay the full statement balance every month.' },
        { id: 'health', title: 'Sort out health insurance',
          body: 'You can stay on a parent\'s health plan until age 26. Compare it with your employer\'s plan when you get an offer.' }
      ]
    },
    {
      group: 'Your money order of operations',
      steps: [
        { id: 'starter', title: '1. Starter emergency fund: $1,000–$2,000',
          body: 'A small cushion so a surprise bill doesn\'t go on a credit card.' },
        { id: 'match', title: '2. Get the full employer 401(k) match',
          body: 'If your employer matches contributions, put in at least enough to get all of it. It is an instant 50–100% return.' },
        { id: 'highdebt', title: '3. Pay off high-interest debt',
          body: 'Credit cards and any loan above ~8% interest. Pay minimums on everything, then attack the highest rate first.' },
        { id: 'fullef', title: '4. Full emergency fund: 3–6 months of essentials',
          body: 'Use the suggestion on the Savings Goals tab, which is calculated from your own budget.' },
        { id: 'roth', title: '5. Fund a Roth IRA (up to $7,500 in 2026)',
          body: 'Low income early in your career makes Roth contributions especially valuable.' },
        { id: 'goals', title: '6. Save for big goals: car, first apartment',
          body: 'Use sinking funds (the goal trackers in this app) so big purchases are paid with cash, not loans.' },
        { id: 'invest', title: '7. Invest more for the long term',
          body: 'Work your total retirement saving up toward 15% of gross pay, then invest extra in a taxable brokerage account.' }
      ]
    }
  ];

  var api = {
    CATEGORIES: CATEGORIES,
    GOALS: GOALS,
    MIX_TARGETS: MIX_TARGETS,
    CHECKLIST: CHECKLIST,
    TYPE_LABELS: { need: 'Need', want: 'Want', save: 'Save', debt: 'Debt' }
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.BudgetDefaults = api;
  }
})(typeof window !== 'undefined' ? window : this);
