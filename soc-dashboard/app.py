from datetime import datetime, timedelta
import streamlit as st
from collections import Counter
import json
from pathlib import Path

# ---------- PAGE CONFIGURATION ----------
st.set_page_config(
    page_title="Mini SOC Dashboard",
    page_icon="🛡️",
    layout="wide"
)

st.title("🛡️ Mini SOC Dashboard")
st.caption("Security Operations Center | Training Lab")

# ---------- LOAD LOG FILE ----------
try:
    with open("auth.log", "r") as file:
        events = [line.strip() for line in file if line.strip()]
except FileNotFoundError:
    st.error("auth.log not found. Place it beside app.py.")
    st.stop()

# ---------- ANALYZE EVENTS ----------
failed_events = [
    event for event in events
    if "login failed" in event.lower()
]

failed_users = Counter()

for event in failed_events:
    if "user=" in event:
        user = event.split("user=", 1)[1].split()[0]
        failed_users[user] += 1

# ---------- TIME-BASED DETECTION ----------
failed_events_by_user = {}

for event in failed_events:
    try:
        timestamp_text = event[:19]
        timestamp = datetime.strptime(
            timestamp_text,
            "%Y-%m-%d %H:%M:%S"
        )

        user = event.split("user=", 1)[1].split()[0]

        failed_events_by_user.setdefault(user, []).append(
            (timestamp, event)
        )
    except (ValueError, IndexError):
        continue

rapid_failures = {}

for user, user_events in failed_events_by_user.items():
    user_events.sort(key=lambda item: item[0])

    for start_index, (start_time, _) in enumerate(user_events):
        window_events = [
            item for item in user_events[start_index:]
            if item[0] <= start_time + timedelta(minutes=5)
        ]

        if len(window_events) >= 3:
            rapid_failures[user] = {
                "Count": len(window_events),
                "First Seen": window_events[0][0].strftime(
                    "%Y-%m-%d %H:%M:%S"
                ),
                "Last Seen": window_events[-1][0].strftime(
                    "%Y-%m-%d %H:%M:%S"
                ),
            }
            break

# ---------- SOURCE IP ANALYSIS ----------
from collections import defaultdict
from datetime import datetime, timedelta
import ipaddress

ip_failures = defaultdict(list)
ip_users = defaultdict(set)

for event in failed_events:
    try:
        timestamp = datetime.strptime(
            event[:19],
            "%Y-%m-%d %H:%M:%S"
        )

        user = event.split("user=", 1)[1].split()[0]
        source_ip = event.split("ip=", 1)[1].split()[0]

        # Validate the IP address before analyzing it
        ipaddress.ip_address(source_ip)

        ip_failures[source_ip].append((timestamp, user, event))
        ip_users[source_ip].add(user)

    except (ValueError, IndexError):
        continue

suspicious_ips = {}

# ---------- MULTI-IP ACCOUNT DETECTION ----------
user_ip_activity = {}

for source_ip, records in ip_failures.items():
    for timestamp, user, event in records:
        user_ip_activity.setdefault(user, []).append(
            (timestamp, source_ip, event)
        )

multi_ip_alerts = {}

for user, records in user_ip_activity.items():
    records.sort(key=lambda record: record[0])

    for start_index, (start_time, _, _) in enumerate(records):
        window = [
            record for record in records[start_index:]
            if record[0] <= start_time + timedelta(minutes=5)
        ]

        unique_ips = sorted({record[1] for record in window})

        if len(unique_ips) >= 3:
            multi_ip_alerts[user] = {
                "Unique Source IPs": len(unique_ips),
                "Source IPs": ", ".join(unique_ips),
                "Failed Attempts": len(window),
                "First Seen": window[0][0].strftime(
                    "%Y-%m-%d %H:%M:%S"
                ),
                "Last Seen": window[-1][0].strftime(
                    "%Y-%m-%d %H:%M:%S"
                ),
                "Severity": "HIGH",
            }
            break

for source_ip, records in ip_failures.items():
    records.sort(key=lambda record: record[0])

    for start_index, (start_time, _, _) in enumerate(records):
        window = [
            record for record in records[start_index:]
            if record[0] <= start_time + timedelta(minutes=5)
        ]

        if len(window) >= 3:
            suspicious_ips[source_ip] = {
                "Failed Attempts": len(window),
                "Users Targeted": ", ".join(sorted({
                    record[1] for record in window
                })),
                "First Seen": window[0][0].strftime(
                    "%Y-%m-%d %H:%M:%S"
                ),
                "Last Seen": window[-1][0].strftime(
                    "%Y-%m-%d %H:%M:%S"
                ),
                "Severity": "HIGH",
            }
            break

# ---------- CLASSIFY INCIDENTS ----------
incidents = []

for user, count in failed_users.items():
    if count >= 3:
        severity = "HIGH"
        action = "Investigate"
    elif count == 2:
        severity = "MEDIUM"
        action = "Review"
    else:
        severity = "LOW"
        action = "Monitor"

    incidents.append({
        "User": user,
        "Failed Attempts": count,
        "Severity": severity,
        "Recommended Action": action
    })

high_count = sum(
    1 for incident in incidents
    if incident["Severity"] == "HIGH"
)
medium_count = sum(
    1 for incident in incidents
    if incident["Severity"] == "MEDIUM"
)
low_count = sum(
    1 for incident in incidents
    if incident["Severity"] == "LOW"
)

# ---------- DASHBOARD METRICS ----------
st.subheader("📊 Security Overview")

col1, col2, col3, col4 = st.columns(4)

col1.metric("Events Analyzed", len(events))
col2.metric("Failed Logins", len(failed_events))
col3.metric("High-Severity Users", high_count)
col4.metric("Users with Failed Logins", len(failed_users))

st.divider()


# ---------- INCIDENT STATUS STORAGE ----------
STATUS_FILE = Path("incident_status.json")

if "incident_statuses" not in st.session_state:
    st.session_state.incident_statuses = {}

    if STATUS_FILE.exists():
        try:
            saved_data = json.loads(STATUS_FILE.read_text())

            for user, details in saved_data.items():
                if isinstance(details, dict):
                    st.session_state.incident_statuses[user] = (
                        details.get("status", "New")
                    )
                    st.session_state[f"note_{user}"] = (
                        details.get("analyst_note", "")
                    )
                elif isinstance(details, str):
                    # Support older files containing only a status
                    st.session_state.incident_statuses[user] = details

        except (json.JSONDecodeError, OSError):
            st.warning("Could not read saved incident data.")

# ---------- IP THREAT DASHBOARD ----------
st.divider()
st.subheader("🌐 Source IP Threat Analysis")

st.metric("Unique Source IPs", len(ip_failures))
st.metric("Suspicious Source IPs", len(suspicious_ips))

if suspicious_ips:
    st.dataframe(
        [
            {"Source IP": source_ip, **details}
            for source_ip, details in suspicious_ips.items()
        ],
        width="stretch",
        hide_index=True
    )
else:
    st.success("No source IPs triggered the detection rule.")

st.subheader("📊 Failed Logins by Source IP")

if ip_failures:
    ip_counts = {
        source_ip: len(records)
        for source_ip, records in ip_failures.items()
    }
    st.bar_chart(ip_counts)
else:
    st.info("No source IP data available.")

# ---------- INCIDENT INVESTIGATION ----------

# ---------- RAPID LOGIN ALERTS ----------
st.subheader("⚡ Rapid Failed-Login Detection")
st.caption("Rule: 3 or more failed logins within 5 minutes")

if rapid_failures:
    for user, details in rapid_failures.items():
        st.error(
            f"HIGH ALERT | User: {user} | "
            f"{details['Count']} failures within 5 minutes"
        )

        st.write(f"First seen: {details['First Seen']}")
        st.write(f"Last seen: {details['Last Seen']}")
else:
    st.success("No rapid failed-login bursts detected.")

# ---------- INCIDENT RESPONSE TRACKER ----------
st.subheader("📋 Incident Response Tracker")

if incidents:
    for incident in incidents:
        user = incident["User"]
        st.markdown(f"**User: {user} — {incident['Severity']}**")

        current_status = st.session_state.incident_statuses.get(
            user, "New"
        )

        new_status = st.selectbox(
            f"Status for {user}",
            ["New", "Investigating", "Resolved"],
            index=["New", "Investigating", "Resolved"].index(
                current_status
                if current_status in ["New", "Investigating", "Resolved"]
                else "New"
            ),
            key=f"status_{user}"
        )

        st.session_state.incident_statuses[user] = new_status

        note_key = f"note_{user}"

        analyst_note = st.text_area(
            f"Analyst notes for {user}",
            value=st.session_state.get(note_key, ""),
            key=note_key,
            placeholder="Record evidence reviewed, findings, and next actions..."
        )



    if st.button("💾 Save Incident Statuses and Notes"):
        try:
            saved_data = {}

            for incident in incidents:
                user = incident["User"]

                saved_data[user] = {
                    "status": st.session_state.incident_statuses.get(
                        user, "New"
                    ),
                    "analyst_note": st.session_state.get(
                        f"note_{user}", ""
                    )
                }

            STATUS_FILE.write_text(
                json.dumps(saved_data, indent=2)
            )

            st.success("Incident statuses and notes saved locally.")

        except OSError as error:
            st.error(f"Could not save incident data: {error}")

else:
    st.info("No incidents available to track.")

st.subheader("🚨 Incident Investigation")

severity_filter = st.selectbox(
    "Filter by severity",
    ["ALL", "HIGH", "MEDIUM", "LOW"]
)

if severity_filter == "ALL":
    filtered_incidents = incidents
else:
    filtered_incidents = [
        incident for incident in incidents
        if incident["Severity"] == severity_filter
    ]

if filtered_incidents:
    st.dataframe(
        filtered_incidents,
        width="stretch",
        hide_index=True
    )
else:
    st.info("No incidents match this severity filter.")

st.write(
    f"**Severity summary:** "
    f"HIGH: {high_count} | "
    f"MEDIUM: {medium_count} | "
    f"LOW: {low_count}"
)

st.divider()

# ---------- FAILED LOGIN CHART ----------
st.subheader("📈 Failed Logins by User")

if failed_users:
    st.bar_chart(dict(failed_users))
else:
    st.info("No failed login events found.")

# ---------- MULTI-IP ACCOUNT ALERTS ----------
st.divider()
st.subheader("🚨 Accounts Targeted by Multiple IPs")

st.caption(
    "Rule: 3 or more distinct source IPs targeting one account "
    "within 5 minutes"
)

if multi_ip_alerts:
    st.dataframe(
        [
            {"Target User": user, **details}
            for user, details in multi_ip_alerts.items()
        ],
        width="stretch",
        hide_index=True
    )
else:
    st.success("No accounts triggered the multi-IP detection rule.")

# ---------- IP INVESTIGATION ----------
st.divider()
st.subheader("🔎 Investigate Source IP")

if ip_failures:
    selected_ip = st.selectbox(
        "Select a source IP",
        sorted(ip_failures.keys())
    )

    selected_records = ip_failures[selected_ip]

    st.write(f"**Source IP:** {selected_ip}")
    st.write(f"**Failed attempts:** {len(selected_records)}")
    st.write(
        "**Users targeted:** "
        + ", ".join(sorted(ip_users[selected_ip]))
    )

    evidence_rows = [
        {
            "Timestamp": timestamp.strftime("%Y-%m-%d %H:%M:%S"),
            "User": user,
            "Source IP": selected_ip,
            "Log Evidence": event,
        }
        for timestamp, user, event in selected_records
    ]

    st.dataframe(
        evidence_rows,
        width="stretch",
        hide_index=True
    )

    ip_report = [
        "MINI SOC - SOURCE IP INVESTIGATION",
        "=" * 36,
        f"Source IP: {selected_ip}",
        f"Failed attempts: {len(selected_records)}",
        "Users targeted: " + ", ".join(sorted(ip_users[selected_ip])),
        "",
        "SUPPORTING EVENTS",
        "-" * 36,
        *[record[2] for record in selected_records],
    ]

    st.download_button(
        "⬇️ Download IP Investigation Report",
        data="\n".join(ip_report),
        file_name=f"ip_investigation_{selected_ip.replace('.', '_')}.txt",
        mime="text/plain",
    )
else:
    st.info("No source IP records available to investigate.")

st.divider()

# ---------- INCIDENT INVESTIGATION ----------
st.subheader("🕵️ Investigate an Incident")

if incidents:
    selected_user = st.selectbox(
        "Select a user to investigate",
        [incident["User"] for incident in incidents]
    )

    selected_incident = next(
        incident for incident in incidents
        if incident["User"] == selected_user
    )

    st.write("### Incident Details")
    st.json(selected_incident)

    user_evidence = [
        event for event in failed_events
        if f"user={selected_user}" in event
    ]

    st.write("### Evidence for Selected User")

    if user_evidence:
        st.dataframe(
            [{"Log Evidence": event} for event in user_evidence],
            width="stretch",
            hide_index=True
        )

    report = [
        "MINI SOC INCIDENT REPORT",
        "========================",
        f"User: {selected_user}",
        f"Failed attempts: {selected_incident['Failed Attempts']}",
        f"Severity: {selected_incident['Severity']}",
        f"Recommended action: {selected_incident['Recommended Action']}",
        "",
        "EVIDENCE:",
        *user_evidence
    ]

    st.download_button(
        label="📥 Download Incident Report",
        data="\n".join(report),
        file_name=f"incident_{selected_user}.txt",
        mime="text/plain"
    )
else:
    st.info("No incidents available to investigate.")

# ---------- EVIDENCE ----------
st.subheader("🔎 Authentication Log Evidence")

if failed_events:
    st.dataframe(
        [{"Log Evidence": event} for event in failed_events],
        width="stretch",
        hide_index=True
    )
else:
    st.info("No failed login evidence to display.")

# ---------- ANALYST NOTE ----------
st.info(
    "Analyst note: Repeated failed logins may indicate suspicious "
    "activity. Investigate the surrounding evidence before deciding "
    "whether an incident is malicious."
)

st.caption(
    "Training environment using practice logs. "
    "Severity thresholds are illustrative, not universal SOC standards."
)

# ---------- SOC SUMMARY REPORT ----------
st.divider()
st.subheader("📄 Export SOC Summary Report")

report_lines = [
    "MINI SOC - INCIDENT SUMMARY REPORT",
    "=" * 36,
    f"Total log events: {len(events)}",
    f"Failed login events: {len(failed_events)}",
    f"High-severity users: {high_count}",
    f"Medium-severity users: {medium_count}",
    f"Low-severity users: {low_count}",
    "",
    "INCIDENT DETAILS",
    "-" * 36,
]

for incident in incidents:
    user = incident["User"]
    saved_status = st.session_state.incident_statuses.get(user, "New")
    note = st.session_state.get(f"note_{user}", "")

    report_lines.extend([
        f"User: {user}",
        f"Failed attempts: {incident['Failed Attempts']}",
        f"Severity: {incident['Severity']}",
        f"Recommended action: {incident['Recommended Action']}",
        f"Investigation status: {saved_status}",
        f"Analyst notes: {note or 'No notes recorded'}",
        "Evidence:",
    ])

    for event in failed_events:
        if f"user={user}" in event:
            report_lines.append(f"  {event}")

    if user in rapid_failures:
        details = rapid_failures[user]
        report_lines.extend([
            "Rapid-login alert: YES",
            f"First seen: {details['First Seen']}",
            f"Last seen: {details['Last Seen']}",
        ])

    report_lines.append("")

st.download_button(
    label="⬇️ Download SOC Summary (.txt)",
    data="\n".join(report_lines),
    file_name="soc_incident_summary.txt",
    mime="text/plain",
)
