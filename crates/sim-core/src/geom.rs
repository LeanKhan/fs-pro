// crates/sim-core/src/geom.rs
//
// 2D Spatial geometry, pitch metrics, and vector calculations for football simulation.
// Real pitch dimensions: ~105m length x 68m width.
// Grid coordinates: 33 columns (x) x 21 rows (y), mapping to normalized fractions [0.0, 1.0].

use serde::{Deserialize, Serialize};

pub const PITCH_LENGTH_METERS: f32 = 105.0;
pub const PITCH_WIDTH_METERS: f32 = 68.0;

pub const GRID_X_BLOCKS: u8 = 33;
pub const GRID_Y_BLOCKS: u8 = 21;

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct Vec2 {
    pub x: f32,
    pub y: f32,
}

impl Vec2 {
    pub const ZERO: Vec2 = Vec2 { x: 0.0, y: 0.0 };

    #[inline]
    pub fn new(x: f32, y: f32) -> Self {
        Self { x, y }
    }

    #[inline]
    pub fn distance(self, other: Vec2) -> f32 {
        let dx = self.x - other.x;
        let dy = self.y - other.y;
        (dx * dx + dy * dy).sqrt()
    }

    #[inline]
    pub fn distance_squared(self, other: Vec2) -> f32 {
        let dx = self.x - other.x;
        let dy = self.y - other.y;
        dx * dx + dy * dy
    }

    #[inline]
    pub fn length(self) -> f32 {
        (self.x * self.x + self.y * self.y).sqrt()
    }

    #[inline]
    pub fn normalize(self) -> Vec2 {
        let len = self.length();
        if len > 1e-5 {
            Vec2 {
                x: self.x / len,
                y: self.y / len,
            }
        } else {
            Vec2::ZERO
        }
    }

    #[inline]
    pub fn dot(self, other: Vec2) -> f32 {
        self.x * other.x + self.y * other.y
    }

    #[inline]
    pub fn lerp(self, other: Vec2, t: f32) -> Vec2 {
        Vec2 {
            x: self.x + (other.x - self.x) * t,
            y: self.y + (other.y - self.y) * t,
        }
    }

    /// Perpendicular distance from a point to a line segment [a, b].
    /// Used for passing lane interception checks and cover shadows.
    pub fn distance_to_segment(self, a: Vec2, b: Vec2) -> f32 {
        let l2 = a.distance_squared(b);
        if l2 < 1e-5 {
            return self.distance(a);
        }
        // Consider the line extending the segment, parameterized as a + t (b - a).
        // Find projection of point onto line segment, clamped between 0.0 and 1.0.
        let t = (((self.x - a.x) * (b.x - a.x) + (self.y - a.y) * (b.y - a.y)) / l2).clamp(0.0, 1.0);
        let projection = Vec2 {
            x: a.x + t * (b.x - a.x),
            y: a.y + t * (b.y - a.y),
        };
        self.distance(projection)
    }

    /// Converts normalized [0.0, 1.0] coordinates to real-world meters.
    #[inline]
    pub fn to_meters(self) -> Vec2 {
        Vec2 {
            x: self.x * PITCH_LENGTH_METERS,
            y: self.y * PITCH_WIDTH_METERS,
        }
    }

    /// Clamps position inside the pitch boundaries with a margin.
    #[inline]
    pub fn clamp_pitch(self) -> Vec2 {
        Vec2 {
            x: self.x.clamp(0.01, 0.99),
            y: self.y.clamp(0.01, 0.99),
        }
    }
}

/// A discrete block on the 33x21 pitch grid
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct Block {
    pub col: u8,
    pub row: u8,
}

impl Block {
    #[inline]
    pub fn new(col: u8, row: u8) -> Self {
        Self {
            col: col.min(GRID_X_BLOCKS - 1),
            row: row.min(GRID_Y_BLOCKS - 1),
        }
    }

    #[inline]
    pub fn to_vec2(self) -> Vec2 {
        Vec2 {
            x: self.col as f32 / (GRID_X_BLOCKS - 1) as f32,
            y: self.row as f32 / (GRID_Y_BLOCKS - 1) as f32,
        }
    }

    #[inline]
    pub fn from_vec2(v: Vec2) -> Self {
        let col = (v.x.clamp(0.0, 1.0) * (GRID_X_BLOCKS - 1) as f32).round() as u8;
        let row = (v.y.clamp(0.0, 1.0) * (GRID_Y_BLOCKS - 1) as f32).round() as u8;
        Self::new(col, row)
    }
}
