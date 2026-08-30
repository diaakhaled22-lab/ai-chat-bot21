with open("lib/db/src/schema/index.ts", "a") as f:
    f.write("\nexport * from \"./adminActivityLogs\";\n")
print("Updated schema/index.ts")
