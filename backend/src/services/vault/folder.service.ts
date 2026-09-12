import { Types } from "mongoose";
import { VAULT_SMART_CATEGORIES } from "../../config/vault.js";
import { Folder, toPublicFolder } from "../../models/vault/Folder.js";
import { AppError } from "../../utils/errors.js";

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export async function ensureSystemFolders(userId: string) {
  const userObjectId = new Types.ObjectId(userId);
  const existing = await Folder.countDocuments({ userId: userObjectId, type: "system" });
  if (existing >= VAULT_SMART_CATEGORIES.length) {
    return;
  }

  for (const category of VAULT_SMART_CATEGORIES) {
    const slug = slugify(category);
    await Folder.updateOne(
      { userId: userObjectId, slug },
      {
        $setOnInsert: {
          userId: userObjectId,
          name: category,
          slug,
          type: "system",
          smartCategory: category,
        },
      },
      { upsert: true },
    );
  }
}

export async function listFolders(userId: string) {
  await ensureSystemFolders(userId);
  const folders = await Folder.find({ userId: new Types.ObjectId(userId) }).sort({
    type: 1,
    name: 1,
  });
  return folders.map(toPublicFolder);
}

export async function getFolderById(userId: string, folderId: string) {
  const folder = await Folder.findOne({
    _id: new Types.ObjectId(folderId),
    userId: new Types.ObjectId(userId),
  });
  if (!folder) throw new AppError(404, "Folder not found");
  return folder;
}

export async function getFolderBySmartCategory(userId: string, category: string) {
  await ensureSystemFolders(userId);
  const folder = await Folder.findOne({
    userId: new Types.ObjectId(userId),
    smartCategory: category,
    type: "system",
  });
  if (!folder) throw new AppError(404, `System folder not found: ${category}`);
  return folder;
}

export async function createFolder(userId: string, name: string, parentId?: string) {
  const slug = slugify(name);
  const existing = await Folder.findOne({
    userId: new Types.ObjectId(userId),
    slug,
  });
  if (existing) throw new AppError(409, "A folder with this name already exists");

  const folder = await Folder.create({
    userId: new Types.ObjectId(userId),
    name: name.trim(),
    slug,
    type: "custom",
    parentId: parentId ? new Types.ObjectId(parentId) : undefined,
  });

  return toPublicFolder(folder);
}

export async function deleteFolder(userId: string, folderId: string) {
  const folder = await getFolderById(userId, folderId);
  if (folder.type === "system") {
    throw new AppError(400, "System folders cannot be deleted");
  }
  await Folder.deleteOne({ _id: folder._id });
}
