"use server";
export const addData = async (formData: FormData) => {
  const email = formData.get("email");
  console.log(email);
  const res = await fetch(
    "https://rajavu.softservedweb.com/api/waiting-lists",
    {
      method: "POST",
      body: JSON.stringify({
        data: {
          product: "Neura Query",
          email,
        },
      }),
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.STRAPI_API_KEY}`,
      },
    }
  );
  console.log(res.status);
};