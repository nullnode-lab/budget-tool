# 💸 Grad Budget Planner

A personal budgeting web app for a recent college graduate who lives with their parents in **East Stroudsburg, PA**. It turns your expected (or actual) salary into an estimated take-home paycheck using 2026 federal, Pennsylvania and local tax rules, then helps you split that money across categories using recommended ranges for someone living at home.

- **No sign-up, no server, no database.** Everything is saved in your own browser (`localStorage`).
- **Free hosting** on GitHub Pages: just static HTML, CSS and JavaScript.
- **Beginner-friendly:** every category and line item comes pre-filled with recommended percentages and a plain-English explanation.

---

## What's inside

| Tab | What it does |
|---|---|
| **Dashboard** | Take-home pay, taxes and savings rate at a glance; a donut chart of where your take-home pay goes; a budget health check; a Needs / Wants / Savings meter; goal progress bars. |
| **Income & Taxes** | Enter an **Expected** salary (the job you're hunting for) and an **Actual** income (part-time job, or your new job once hired), and choose which one drives the budget. Salary or hourly. Adjust 401(k), employer match, pre-tax health insurance, your municipality's earned income tax (EIT) and the Local Services Tax (LST). Shows a line-by-line paycheck estimate. |
| **Budget** | Six categories you can switch on and off, each with line items you can edit, add, rename or delete. Every line has a slider with the **recommended range drawn in green**, a % box and a $ box (edit either one). The **% / $** switch decides whether a line grows with your pay or stays a fixed bill. |
| **Savings Goals** | Progress bars for big purchases (emergency fund, car down payment, first apartment, or your own). Link a goal to a budget line to project when you'll reach it, set a target date to see if you're on track, and log deposits as you make them. |
| **Game Plan** | A financial-planner "order of operations" checklist, plus a glossary of money terms. |
| **Settings** | Download or restore a backup, erase everything, and choose light, dark or automatic theme. |

The **Monthly / Bi-weekly / Weekly** switch at the top converts every dollar amount in the app to your pay cycle.

### Smart default ranges (percent of take-home pay)

| Category | Default | Recommended | Why |
|---|---|---|---|
| 🏡 Parental contribution (rent/mortgage share + utilities) | 15% | **10–20%** | A fair share of household costs that builds the "paying rent" habit while staying far below the cost of an apartment. |
| 🔑 Future rent / mortgage | *off* | 25–35% | Ready for when you move out (then turn off Parental Contribution). |
| 🚗 Car & transportation (down-payment fund, future payment, insurance, gas, upkeep) | 17% | 10–20% | Total running costs at or below ~15–20%; save a big down payment now (20/4/10 rule). |
| 🎓 Student loans | 8% | 5–15% | Placeholder until you know your real payment (switch it to $). |
| 🛒 General living (groceries, phone, subscriptions, dining, fun, personal) | 21% | 12–22% | Living at home keeps this low, and budgeting some fun keeps the plan realistic. |
| 🚀 Aggressive savings & investing (emergency fund, Roth IRA, apartment fund, index funds) | 39% | 30–50% | Low living costs are your biggest financial advantage right now. |

Together, the defaults add up to exactly 100% of take-home pay. Counting the car down-payment fund, you save about **47%** of take-home pay, plus the 401(k).

### How taxes are estimated (tax year 2026, single filer)

- **Federal income tax:** 2026 brackets (10% / 12% / 22% / 24% / 32% / 35% / 37%) after the $16,100 standard deduction. Traditional 401(k) contributions and pre-tax health premiums reduce federal taxable wages.
- **FICA:** Social Security 6.2% (up to the $184,500 wage base) and Medicare 1.45% (+0.9% above $200,000).
- **Pennsylvania:** a flat 3.07%. PA has no standard deduction, and **401(k) contributions are still taxed by PA**. Optional PA Tax Forgiveness for very low incomes.
- **PA unemployment (UC) withholding:** 0.07% of wages.
- **Local Earned Income Tax (EIT):** set by the municipality you live in. Presets for the townships that share the "East Stroudsburg 18301" mailing address:

  | Municipality | Resident EIT | PSD code |
  |---|---|---|
  | East Stroudsburg Borough | 1.0% | 450101 |
  | Stroud Township | 1.25% | 450403 |
  | Smithfield Township | 1.0% | 450104 |
  | Middle Smithfield Township | 1.0% | 450102 |
  | Price Township | 1.0% | 450103 |
  | Stroudsburg Borough | 1.0% | 450404 |

  Confirm yours with the [PA DCED PSD code & EIT rate lookup](https://dced.pa.gov/local-government/local-income-tax-information/psd-codes-and-eit-rates/).
- **Local Services Tax (LST):** up to $52/year, charged by the municipality where you **work**. You're exempt if you earn under $12,000.

> These are planning estimates, not tax advice. Your real paycheck depends on your W-4, your benefits and your employer's payroll system.

---

## Project files

```
index.html        Page layout (all six tabs)
css/styles.css    Styles, including light & dark themes
js/tax.js         2026 federal + PA + local paycheck calculator
js/defaults.js    Default categories, recommended ranges, tips, goals, checklist
js/app.js         App logic: saving, rendering, charts, goals
.nojekyll         Tells GitHub Pages to serve the files as-is
```

[Chart.js](https://www.chartjs.org/) is loaded from a CDN for the donut chart. If it can't load (for example, offline), the app still works and the table next to the chart shows the same numbers.

---

## Host it free on GitHub Pages (step by step)

### Option A: Use this repository (`nullnode-lab/budget-tool`)

The code is already in this repository, so you only need to turn on Pages.

1. Go to **https://github.com/nullnode-lab/budget-tool** and sign in.
2. **Get the code onto your `main` branch.** If the files are on a different branch (for example a pull request branch), open the **Pull requests** tab, open the pull request and click **Merge pull request** → **Confirm merge**.
   *If there's no pull request:* go to the **Code** tab, switch to the branch that holds `index.html`, click **Compare & pull request** → **Create pull request** → **Merge pull request**.
   *Alternatively*, you can skip merging and pick that branch in step 5.
3. Click **⚙️ Settings** (top menu of the repository).
4. In the left sidebar, click **Pages**.
5. Under **Build and deployment**:
   - **Source:** `Deploy from a branch`
   - **Branch:** `main` (or the branch that holds `index.html`), folder **`/ (root)`**
   - Click **Save**.
6. Wait 1–2 minutes and refresh the Pages settings screen. A banner appears: **"Your site is live at https://nullnode-lab.github.io/budget-tool/"**.
7. Open that link and bookmark it (or on your phone, use **Share → Add to Home Screen** to make it feel like an app).

> **Note:** On a free GitHub account, Pages only works for **public** repositories. That's fine here: the repository only holds the app's code. **Your budget numbers are never uploaded.** They live only in your browser's local storage.

### Option B: Start from scratch in a new repository (no command line needed)

1. Download this project: on the repository page click **Code → Download ZIP**, then unzip it.
2. Sign in to [github.com](https://github.com), click **+** (top right) → **New repository**.
3. Name it (e.g. `budget-tool`), choose **Public**, and click **Create repository**.
4. On the new empty repository page, click **uploading an existing file**.
5. Drag in **everything inside** the unzipped folder: `index.html`, `README.md`, `.nojekyll`, and the `css` and `js` folders. Keep the folder structure. `index.html` must sit at the top level, not inside another folder.
   *Tip:* `.nojekyll` is a hidden file. On macOS press `Cmd + Shift + .` in Finder to show hidden files. It's optional; the site works without it.
6. Scroll down and click **Commit changes**.
7. Follow steps 3–7 of Option A, choosing the `main` branch and `/ (root)`.

### Option C: Command line (if you use git)

```bash
git clone https://github.com/<your-username>/<your-repo>.git
cd <your-repo>
# copy index.html, css/, js/, .nojekyll and README.md into this folder
git add .
git commit -m "Add budget planner"
git push origin main
```

Then turn on Pages as in Option A, steps 3–7.

### Updating the site later

Edit a file on GitHub (click the file → ✏️ pencil icon → **Commit changes**) or push new commits. GitHub Pages redeploys automatically in about a minute. Your saved budget data is not affected by updates.

---

## Using it day to day

1. **Income & Taxes:** enter the salary you're targeting as *Expected*. Pick your municipality. Set 401(k) to 0 if you don't have one yet.
2. **Budget:** read the tips (the **?** buttons), adjust sliders, and switch categories on or off. Use **Send leftover to savings** so every dollar has a job.
3. **Savings Goals:** set targets (use the suggested emergency-fund target), and log money each time you move it to savings.
4. **When you're hired:** enter your real pay as *Actual*, switch **Build my budget from** to *Actual income*, and set the pay cycle to match your paychecks.
5. **Back up monthly:** Settings → **Download backup**. Restore it on a new device or browser with **Restore from backup**.

### Run it on your computer (optional)

Double-click `index.html` to open it in your browser. Data saved this way is separate from the GitHub Pages copy, because each address has its own local storage. Use backup/restore to move data between them.

---

## Customizing

- **Recommended ranges, tips, default goals, checklist:** edit `js/defaults.js`.
- **Tax numbers (update each January):** edit the `TAX` object at the top of `js/tax.js` with the new year's brackets, standard deduction, Social Security wage base and contribution limits.
- **Local tax presets:** edit `LOCAL_PRESETS` in `js/tax.js`.
- **Colors and layout:** edit `css/styles.css`. Chart colors use the `--series-1` … `--series-8` variables.

## Privacy

- Data is stored under the key `gradBudget.v1` in your browser's local storage, on your device only.
- Clearing site data / browser history, using private browsing, or switching browsers or devices means starting fresh, so keep a backup file.
- All pages at `https://<username>.github.io/` share one storage area per browser. Only host projects you trust under the same account.

*Educational planning tool. Not tax, legal or investment advice.*
