import express from "express";

const router = express.Router();

interface Testimonial {
  id: number;
  customerName: string;
  companyName?: string;
  message: string;
  rating: number;
  image?: string;
  status: "pending" | "approved" | "rejected";
  createdAt: string;
  createdBy?: string;
}

const testimonials: Testimonial[] = [];

// GET all testimonials
router.get("/", (req, res) => {
  try {
    const isAdmin = req.query.admin === "true";
    if (isAdmin) {
      return res.json(testimonials);
    }
    // public site - only approved
    const approved = testimonials.filter((t) => t.status === "approved");
    res.json(approved);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch testimonials" });
  }
});

// CREATE testimonial
router.post("/", (req, res) => {
  try {
    const {
      customerName,
      companyName,
      message,
      rating,
      image,
      status,
      createdBy,
    } = req.body as Partial<Testimonial>;

    if (!customerName || !message || typeof rating !== "number") {
      return res.status(400).json({
        error: "customerName, message and rating (number) are required",
      });
    }

    const newId = testimonials.length > 0 ? testimonials[testimonials.length - 1].id + 1 : 1;
    const now = new Date().toISOString();
    const newTestimonial: Testimonial = {
      id: newId,
      customerName,
      companyName: companyName || "",
      message,
      rating,
      image: image || "",
      status: status || "pending",
      createdAt: now,
      createdBy: createdBy || "admin",
    };

    testimonials.unshift(newTestimonial);
    res.status(201).json(newTestimonial);
  } catch (err) {
    res.status(500).json({ error: "Failed to create testimonial" });
  }
});

// GET by id
router.get("/:id", (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const t = testimonials.find((x) => x.id === id);
    if (!t) return res.status(404).json({ error: "Testimonial not found" });
    res.json(t);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch testimonial" });
  }
});

// UPDATE by id
router.put("/:id", (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const t = testimonials.find((x) => x.id === id);
    if (!t) return res.status(404).json({ error: "Testimonial not found" });

    const {
      customerName,
      companyName,
      message,
      rating,
      image,
      status,
      createdBy,
    } = req.body as Partial<Testimonial>;

    if (customerName !== undefined) t.customerName = customerName;
    if (companyName !== undefined) t.companyName = companyName;
    if (message !== undefined) t.message = message;
    if (rating !== undefined) t.rating = rating as number;
    if (image !== undefined) t.image = image;
    if (status !== undefined) t.status = status as Testimonial["status"];
    if (createdBy !== undefined) t.createdBy = createdBy;

    res.json(t);
  } catch (err) {
    res.status(500).json({ error: "Failed to update testimonial" });
  }
});

// DELETE by id
router.delete("/:id", (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const idx = testimonials.findIndex((x) => x.id === id);
    if (idx === -1) return res.status(404).json({ error: "Testimonial not found" });
    testimonials.splice(idx, 1);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete testimonial" });
  }
});

export default router;


