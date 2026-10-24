import unittest
from ai_animation import AIAnimationError, validate_storyboard, generate_storyboard


def sample():
    return {"title": "Test", "fps": 24,
            "frames": [{"duration": 8, "actors": [{"id": 1, "x": 300, "y": 300, "pose": "idle"}]},
                       {"duration": 1, "actors": [{"id": 1, "x": 340, "y": 300, "pose": "punch"}]}]}


class AITests(unittest.TestCase):
    def test_accepts_small_storyboard(self):
        self.assertEqual(validate_storyboard(sample())["title"], "Test")

    def test_rejects_bad_pose(self):
        value = sample()
        value["frames"][1]["actors"][0]["pose"] = "invalid"
        with self.assertRaises(AIAnimationError):
            validate_storyboard(value)

    def test_rejects_duplicate_actor(self):
        value = sample()
        actor = value["frames"][0]["actors"][0]
        value["frames"][0]["actors"].append(dict(actor))
        with self.assertRaises(AIAnimationError):
            validate_storyboard(value)

    def test_rejects_unbounded_prompt_before_network(self):
        with self.assertRaises(AIAnimationError):
            generate_storyboard({"provider": "openai", "prompt": "x" * 4001})


if __name__ == "__main__":
    unittest.main()
