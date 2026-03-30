"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function LoginPage() {
  const { user, login } = useAuth();
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // If already logged in, redirect
  useEffect(() => {
    if (user) router.push("/games");
  }, [user, router]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    const ok = await login(username, password);
    if (!ok) setError("Oops! Wrong username or password 😅");
    else router.push("/games");
    setLoading(false);
  };

  return (
    <div className="flex flex-1 items-center justify-center bg-gradient-to-br from-sky-100 via-purple-50 to-pink-100 p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="text-6xl mb-3">🎮</div>
          <h1 className="text-3xl font-black text-teal-600 tracking-tight">
            KidPlay Arcade
          </h1>
          <p className="text-base text-gray-500 mt-1 font-semibold">
            Play with your friends!
          </p>
        </div>

        <form
          onSubmit={handleLogin}
          className="bg-white rounded-3xl shadow-lg p-6 space-y-4"
        >
          <div>
            <label
              htmlFor="username"
              className="block text-sm font-bold text-gray-600 mb-1"
            >
              Your Name
            </label>
            <Input
              id="username"
              placeholder="e.g. Alex"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="rounded-xl text-base h-12"
              autoComplete="username"
              required
            />
          </div>
          <div>
            <label
              htmlFor="password"
              className="block text-sm font-bold text-gray-600 mb-1"
            >
              Secret Password
            </label>
            <Input
              id="password"
              type="password"
              placeholder="🔒 Shhh..."
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="rounded-xl text-base h-12"
              autoComplete="current-password"
              required
            />
          </div>

          {error && (
            <p className="text-red-500 text-sm font-semibold text-center">
              {error}
            </p>
          )}

          <Button
            type="submit"
            disabled={loading}
            className="w-full h-12 rounded-xl bg-teal-500 hover:bg-teal-600 text-white text-lg font-bold shadow-md"
          >
            {loading ? "Logging in..." : "Let's Play! 🚀"}
          </Button>
        </form>

        <p className="text-center text-xs text-gray-400 mt-4 font-semibold">
          Ask your parent for your login info 😊
        </p>
      </div>
    </div>
  );
}
