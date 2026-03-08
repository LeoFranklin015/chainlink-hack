import { NextResponse } from "next/server"

const CRE_BACKEND_URL = process.env.CRE_BACKEND_URL || "http://localhost:3100"

export async function POST(request: Request): Promise<Response> {
  const { walletAddress, nullifierHash } = await request.json()

  if (!walletAddress || !nullifierHash) {
    return NextResponse.json(
      { error: "Missing walletAddress or nullifierHash" },
      { status: 400 }
    )
  }

  try {

    const res = await fetch(`${CRE_BACKEND_URL}/allowlist`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ walletAddress, nullifierHash }),
    })

    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to reach CRE backend", detail: String(err) },
      { status: 502 }
    )
  }
}
