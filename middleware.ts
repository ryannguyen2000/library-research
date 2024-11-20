import { NextRequest, NextResponse } from "next/server";

export function middleware(req: NextRequest) {
  // Lấy đường dẫn URL
  // const { pathname } = request.nextUrl;

  // Ví dụ: Chặn truy cập nếu không xác thực
  // if (pathname.startsWith("/dashboard") && !request.cookies.has("token")) {
  //   return NextResponse.redirect(new URL("/login", request.url));
  // }

  // Ví dụ: Thêm tiêu đề hoặc chỉnh sửa request
  // const response = NextResponse.next();
  // response.headers.set("x-custom-header", "Hello, Middleware");
  // return response;

  // Lấy token từ cookies
  const token = req.cookies.get("token")?.value;

  // Nếu không có token, chuyển hướng đến trang đăng nhập
  if (!token) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  // Nếu có token, tiếp tục yêu cầu
  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path"], // Chỉ áp dụng middleware cho các route khớp
};
