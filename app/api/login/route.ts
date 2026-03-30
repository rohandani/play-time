import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

type UserEntry = { username: string; password: string; avatar: string };

function getUsers(): UserEntry[] {
  const filePath = path.join(process.cwd(), "data", "users.json");
  const raw = fs.readFileSync(filePath, "utf-8");
  return JSON.parse(raw);
}

export async function POST(req: NextRequest) {
  const { username, password } = await req.json();

  if (!username || !password) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  const users = getUsers();
  const found = users.find(
    (u) => u.username.toLowerCase() === username.toLowerCase() && u.password === password
  );

  if (!found) {
    return NextResponse.json({ error: "Wrong username or password" }, { status: 401 });
  }

  return NextResponse.json({ username: found.username.toLowerCase(), avatar: found.avatar });
}
