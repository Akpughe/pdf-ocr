import { Worker, Job } from "bullmq";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import axios from "axios";
import Stripe from "stripe";
import { redisConnection } from "../config/redis";

dotenv.config();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const paystackSecret = process.env.PAYSTACK_SECRET_KEY!;

console.log("Redis URL:", redisConnection.options.host);

if (!supabaseUrl || !supabaseAnonKey || !paystackSecret) {
  throw new Error(
    "Missing required environment variables. Please ensure NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, and PAYSTACK_SECRET_KEY are set."
  );
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string);

// Function to cancel Paystack subscription
async function cancelPaystackSubscription(user_id: string) {
  try {
    // Get subscription details from Supabase
    const { data: subscriptionData } = await supabase
      .from("subscriptions")
      .select("subscription_code, email_token")
      .eq("user_id", user_id)
      .single();

    if (subscriptionData?.subscription_code && subscriptionData?.email_token) {
      const response = await axios.post(
        `https://api.paystack.co/subscription/disable`,
        {
          code: subscriptionData.subscription_code,
          token: subscriptionData.email_token,
        },
        {
          headers: {
            Authorization: `Bearer ${paystackSecret}`,
            "Content-Type": "application/json",
          },
        }
      );
      console.log(
        "Paystack subscription cancellation response:",
        response.data
      );
      return true;
    }
    return false;
  } catch (error) {
    console.error("Paystack subscription cancellation error:", error);
    return false;
  }
}

async function cancelStripeSubscription(user_id: string) {
  try {
    // Get subscription details from Supabase
    const { data: subscriptionData } = await supabase
      .from("subscriptions")
      .select("stripe_sub_code, subscription_end_date")
      .eq("user_id", user_id)
      .single();

    if (subscriptionData?.stripe_sub_code) {
      // Cancel the subscription in Stripe
      const subscription = await stripe.subscriptions.cancel(
        subscriptionData.stripe_sub_code
      );
      console.log("Stripe subscription cancellation response:", subscription);

      // Update subscription status in Supabase
      await supabase
        .from("subscriptions")
        .update({
          subscription_status: "cancelling",
          cancellation_date: new Date().toISOString(),
        })
        .eq("user_id", user_id);

      return true;
    }
    return false;
  } catch (error) {
    console.error("Stripe subscription cancellation error:", error);
    return false;
  }
}

// Worker to handle subscription expirations
const expirationWorker = new Worker(
  "subscription-expiration-queue",
  async (job: Job) => {
    try {
      const { email, user_id } = job.data;

      // Get the free plan ID from Supabase
      const { data: freePlan } = await supabase
        .from("plans")
        .select("id")
        .eq("name", "Free")
        .single();

      if (!freePlan) {
        throw new Error("Free plan not found");
      }

      // get subscription status from supabase
      const { data: subscriptionData } = await supabase
        .from("subscriptions")
        .select("subscription_status, payment_platform")
        .eq("user_id", user_id)
        .single();

      // Update subscription status to expired and set to free plan
      await supabase
        .from("subscriptions")
        .update({
          subscription_status: "expired",
          plan_id: freePlan.id,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", user_id);

      // Cancel Paystack subscription last

      // await cancelPaystackSubscription(user_id);
      // if (subscriptionData?.payment_platform === "paystack") {
      //   await cancelPaystackSubscription(user_id);
      // }

      return { success: true };
    } catch (error) {
      console.error("Subscription expiration worker error:", error);
      throw error;
    }
  },
  {
    connection: redisConnection,
    prefix: "subscription",
    concurrency: 1,
    autorun: true,
  }
);

// Worker to handle subscription cancellations
const cancellationWorker = new Worker(
  "subscription-cancellation-queue",
  async (job: Job) => {
    try {
      const { user_id, end_date } = job.data;

      // Check if we've reached the end date
      if (new Date() >= new Date(end_date)) {
        // Get the free plan ID from Supabase
        const { data: freePlan } = await supabase
          .from("plans")
          .select("id")
          .eq("name", "Free")
          .single();

        if (!freePlan) {
          throw new Error("Free plan not found");
        }

        // Update subscription status to cancelled and set to free plan
        await supabase
          .from("subscriptions")
          .update({
            subscription_status: "cancelled",
            plan_id: freePlan.id,
            updated_at: new Date().toISOString(),
          })
          .eq("user_id", user_id);

        return { success: true, message: "Subscription cancelled" };
      }

      // If not reached end date, requeue the job
      return { success: true, requeue: true };
    } catch (error) {
      console.error("Subscription cancellation worker error:", error);
      throw error;
    }
  },
  {
    connection: redisConnection,
    prefix: "subscription",
    concurrency: 1,
    autorun: true,
  }
);

// Worker status logging
expirationWorker.on("ready", () => {
  console.log("🟢 Subscription Expiration Worker is ready");
});

expirationWorker.on("active", (job) => {
  console.log(`📝 Subscription Expiration Worker processing job ${job.id}`);
});

expirationWorker.on("completed", (job) => {
  console.log(`✅ Subscription Expiration Worker completed job ${job.id}`);
});

expirationWorker.on("failed", (job, error) => {
  console.error(
    `❌ Subscription Expiration Worker failed job ${job?.id}:`,
    error
  );
});

expirationWorker.on("error", (error: Error) => {
  console.error("⚠️ Subscription Expiration Worker error:", error);
});

// Cancellation worker status logging
cancellationWorker.on("ready", () => {
  console.log("🟢 Subscription Cancellation Worker is ready");
});

cancellationWorker.on("active", (job) => {
  console.log(`📝 Subscription Cancellation Worker processing job ${job.id}`);
});

cancellationWorker.on("completed", (job) => {
  console.log(`✅ Subscription Cancellation Worker completed job ${job.id}`);
});

cancellationWorker.on("failed", (job, error) => {
  console.error(
    `❌ Subscription Cancellation Worker failed job ${job?.id}:`,
    error
  );
});

cancellationWorker.on("error", (error: Error) => {
  console.error("⚠️ Subscription Cancellation Worker error:", error);
});

export { expirationWorker, cancellationWorker };
