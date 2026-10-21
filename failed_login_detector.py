
failed_logins = {}

with open("auth.log", "r") as file:
    for line in file:
        if "login failed" in line:
            user = line.split("user=")[1].strip()
            failed_logins[user] = failed_logins.get(user, 0) + 1

print("=== Failed Login Detection ===")

for user, count in failed_logins.items():
    print(user, ":", count, "failed attempts")

    if count >= 3:
        print("ALERT: Repeated login failures for", user)
