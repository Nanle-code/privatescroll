import dotenv from "dotenv";
import cors from "cors";
dotenv.config();

import express from "express";
import router from "./router";

const app = express();
app.use(cors());
app.use(express.json());

app.use("/api", router);
const PORT = process.env.PORT || 3001;

if (process.env.NODE_ENV !== "test") {
  app.listen(PORT, () => {
    console.log(`PrivateScroll backend running on port ${PORT}`);
  });
}

export default app;
