
counts = {
    "WARNING": 0,
    "ERROR": 0,
    "CRITICAL": 0
}

unknown_count = 0
critical_events = []

with open("auth.log", "r") as file:
    for line in file:
        line = line.strip()

        if not line:
            continue

        matched = False

        for severity in counts:
            if severity in line:
                counts[severity] += 1
                matched = True

                if severity == "CRITICAL":
                    critical_events.append(line)

                break

        if not matched:
            unknown_count += 1

if counts["CRITICAL"] > 0:
    risk = "HIGH"
    risk_message = "Critical events require investigation."
elif counts["ERROR"] > 0:
    risk = "MEDIUM"
    risk_message = "Errors found; review the affected events."
else:
    risk = "LOW"
    risk_message = "No errors or critical events detected."

report = "=== SOC Security Event Report ===\n"

for severity, count in counts.items():
    report += f"{severity}: {count}\n"

report += f"Other records: {unknown_count}\n"
report += f"Overall risk: {risk}\n"
report += f"Assessment: {risk_message}\n"

report += "\n=== Critical Event Evidence ===\n"

if critical_events:
    for event in critical_events:
        report += event + "\n"
else:
    report += "No critical events found.\n"

with open("soc_report.txt", "w") as file:
    file.write(report)

print(report)
print("Report saved to soc_report.txt")
