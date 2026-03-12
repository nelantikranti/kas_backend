import express from "express";
import { authenticate } from "../middleware/auth";
import { checkPermission } from "../middleware/permissions";
import { PERMISSIONS } from "../utils/permissions";

const router = express.Router();

const getNumericRouteId = (value: string | string[]) => parseInt(String(value), 10);

const requireAdminBlogViewIfNeeded = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (req.query.admin === "true") {
    return authenticate(req, res, () => checkPermission(PERMISSIONS.BLOGS_VIEW)(req, res, next));
  }
  next();
};

interface BlogPost {
  id: number;
  title: string;
  excerpt: string;
  content: string;
  author: string;
  date: string;
  category: string;
  image: string;
  views: number;
  published?: boolean;
  googleReviewUrl?: string;
}

const blogs: BlogPost[] = [];

// GET all blogs
router.get("/", requireAdminBlogViewIfNeeded, (req, res) => {
  try {
    const isAdmin = req.query.admin === "true";
    
    // If admin, return all blogs (including unpublished)
    // Otherwise, return only published blogs
    if (isAdmin) {
      res.json(blogs);
    } else {
      const publishedBlogs = blogs.filter(blog => blog.published !== false);
      res.json(publishedBlogs);
    }
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch blogs" });
  }
});

// CREATE new blog
router.post("/", authenticate, checkPermission(PERMISSIONS.BLOGS_CREATE), (req, res) => {
  try {
    const {
      title,
      excerpt,
      content,
      author,
      category,
      image,
      googleReviewUrl,
      published,
    } = req.body as Partial<BlogPost>;

    if (!title || !excerpt || !content || !author || !category || (!image && !googleReviewUrl)) {
      return res
        .status(400)
        .json({
          error:
            "title, excerpt, content, author, category and either image or googleReviewUrl are required",
        });
    }

    const finalImage =
      image ||
      "https://via.placeholder.com/800x300.png?text=Google+Review";

    const newId = blogs.length > 0 ? blogs[blogs.length - 1].id + 1 : 1;

    const newBlog: BlogPost = {
      id: newId,
      title,
      excerpt,
      content,
      author,
      category,
      image: finalImage,
      googleReviewUrl,
      published: published !== undefined ? published : true,
      views: 0,
      date: new Date().toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      }),
    };

    blogs.unshift(newBlog);

    res.status(201).json(newBlog);
  } catch (error) {
    res.status(500).json({ error: "Failed to create blog" });
  }
});

// GET blog by ID
router.get("/:id", (req, res) => {
  try {
    const blog = blogs.find((b) => b.id === getNumericRouteId(req.params.id));
    if (!blog) {
      return res.status(404).json({ error: "Blog post not found" });
    }
    // Increment views
    blog.views += 1;
    res.json(blog);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch blog post" });
  }
});

// UPDATE blog by ID
router.put("/:id", authenticate, checkPermission(PERMISSIONS.BLOGS_EDIT), (req, res) => {
  try {
    const id = getNumericRouteId(req.params.id);
    const blog = blogs.find((b) => b.id === id);

    if (!blog) {
      return res.status(404).json({ error: "Blog post not found" });
    }

    const {
      title,
      excerpt,
      content,
      author,
      category,
      image,
      googleReviewUrl,
    } = req.body as Partial<BlogPost>;

    if (!title || !excerpt || !content || !author || !category || (!image && !googleReviewUrl)) {
      return res.status(400).json({
        error:
          "title, excerpt, content, author, category and either image or googleReviewUrl are required",
      });
    }

    blog.title = title;
    blog.excerpt = excerpt;
    blog.content = content;
    blog.author = author;
    blog.category = category;
    blog.image =
      image ||
      blog.image ||
      "https://via.placeholder.com/800x300.png?text=Google+Review";
    blog.googleReviewUrl = googleReviewUrl;
    // date/views ko yahin rehne do (views preserve)

    res.json(blog);
  } catch (error) {
    res.status(500).json({ error: "Failed to update blog post" });
  }
});

// DELETE blog by ID
router.delete("/:id", authenticate, checkPermission(PERMISSIONS.BLOGS_DELETE), (req, res) => {
  try {
    console.log(`DELETE request received for blog ID: ${req.params.id}`);
    const id = getNumericRouteId(req.params.id);
    const index = blogs.findIndex((b) => b.id === id);

    if (index === -1) {
      console.log(`Blog with ID ${id} not found`);
      return res.status(404).json({ error: "Blog post not found" });
    }

    blogs.splice(index, 1);
    console.log(`Blog with ID ${id} deleted successfully. Remaining blogs: ${blogs.length}`);

    res.json({ success: true, message: "Blog deleted successfully" });
  } catch (error) {
    console.error("Error deleting blog:", error);
    res.status(500).json({ error: "Failed to delete blog post" });
  }
});

export default router;
