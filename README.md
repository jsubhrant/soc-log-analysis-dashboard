# SOC Log Analysis Dashboard

A beginner-friendly Security Operations Center (SOC) project built with Python and Streamlit to analyze authentication logs, detect suspicious login activity, and support basic incident investigation.

## Overview

This project explores how SOC analysts can use authentication logs to identify potentially suspicious behavior. It combines Python-based detection logic with a simple dashboard for reviewing security events and documenting investigations.

The project is designed as a hands-on cybersecurity learning lab using synthetic authentication logs.

## Features

- **Authentication Log Analysis** — Parses sample authentication events.
- **Failed Login Detection** — Identifies repeated failed login attempts.
- **Severity Classification** — Groups suspicious activity by severity.
- **IP-Based Analysis** — Examines source IP addresses in sample logs.
- **Incident Investigation** — Displays events for further review.
- **Incident Tracking** — Records incident status and analyst notes.
- **Dashboard Visualization** — Presents event summaries and charts.
- **Report Export** — Supports exporting investigation summaries.

*Note: Detection behavior and individual features should be validated against test cases before operational use.*

## Technology Stack

- Python
- Streamlit
- Git and GitHub
- Authentication log analysis

## Project Structure

```text
Cybersecurity/
├── hello_soc.py
├── failed_login_detector.py
├── auth.log
├── .gitignore
└── soc-dashboard/
    ├── app.py
    ├── auth.log
    └── incident_status.json
```

## Getting Started

### 1. Clone the repository

```bash
git clone https://github.com/jsubhrant/soc-log-analysis-dashboard.git
cd soc-log-analysis-dashboard
```

### 2. Create and activate a virtual environment

On macOS or Linux:

```bash
python3 -m venv .venv
source .venv/bin/activate
```

### 3. Install the dashboard dependency

```bash
python3 -m pip install streamlit
```

### 4. Run the dashboard

```bash
cd soc-dashboard
streamlit run app.py
```

Streamlit should provide a local URL, usually `http://localhost:8501`, where you can open the dashboard in your browser.

## Learning Objectives

This project helps develop practical skills in:

- Authentication log analysis
- Basic security detection logic
- Incident triage and severity classification
- Source IP investigation
- Security dashboard development
- Git-based version control

## Roadmap

- [ ] Validate detections using repeatable test cases.
- [ ] Improve log parsing and error handling.
- [ ] Integrate Wazuh SIEM alerts.
- [ ] Add AI-assisted alert explanations.
- [ ] Map selected incidents to relevant GRC controls.

## Disclaimer

This repository is intended for educational and defensive cybersecurity purposes. It uses sample authentication logs and is not a production-ready SIEM or incident response system.

## Author

**Subhrant Jha**

Cybersecurity | SOC | Digital Forensics | GRC
