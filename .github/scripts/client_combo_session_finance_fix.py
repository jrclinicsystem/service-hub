from pathlib import Path

# One-time source patch already applied to main. Keep this script intentionally
# idempotent because its workflow may be re-run for follow-up validation.
required = [
    Path("src/components/client-profile-dialog.tsx"),
    Path("src/components/admin-appointments-workspace.tsx"),
    Path("src/components/finance-staging-workspace.tsx"),
    Path("src/components/finance-attendance-completion.tsx"),
]
missing = [str(path) for path in required if not path.exists()]
if missing:
    raise SystemExit(f"missing expected source files: {', '.join(missing)}")

print("client combo session finance source patch already applied")
