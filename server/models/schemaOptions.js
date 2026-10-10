/**
 * Shared schema options: timestamps, plus JSON output that exposes `id`
 * instead of `_id` and drops `__v`.
 */
const toJSON = {
  virtuals: true,
  versionKey: false,
  transform: (doc, ret) => {
    delete ret._id;
    return ret;
  },
};

module.exports = { timestamps: true, toJSON, toObject: toJSON };
