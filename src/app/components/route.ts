import { NextResponse } from "next/server";
import { comments } from "./data";

export async function GET() {
  // const data = {
  //   success: true,
  //   message: "Component data",
  //   data: comments,
  // };

  // // bắt buộc chuyển object data thành chuỗi json
  // return new Response(JSON.stringify(data), {
  //   status: 200,
  //   headers: { "Content-Type": "application/json" },
  // });

  return NextResponse.json({ message: "Component data", result: comments });
}

export async function POST(request: Request) {
  const comment = await request.json();
  const newcomment = {
    id: comments.length + 1,
    name: comment.text,
  };
  comments.push(newcomment);
  return new Response(JSON.stringify(newcomment), {
    headers: {
      "Content-Type": "application/json",
    },
    status: 201,
  });
}
