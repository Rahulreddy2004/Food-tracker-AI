"""Regenerate vision.onnx, a tiny stand-in for SigLIP 2's image encoder used by the unit tests.

    uv run --with onnx python tests/fixtures/zeroshot/make_vision_onnx.py

pixel_values [N, 3, 32, 32] -> mean colour per channel -> image_embeds [N, 4] (4th value 0), so a
red, green or blue photo maps onto a known direction.
"""

from pathlib import Path

import numpy as np
import onnx
from onnx import TensorProto, helper, numpy_helper

weights = np.eye(3, 4, dtype=np.float32)
graph = helper.make_graph(
    [
        helper.make_node("ReduceMean", ["pixel_values"], ["colour"], axes=[2, 3], keepdims=0),
        helper.make_node("MatMul", ["colour", "projection"], ["image_embeds"]),
    ],
    "tiny_vision",
    [helper.make_tensor_value_info("pixel_values", TensorProto.FLOAT, ["batch", 3, 32, 32])],
    [helper.make_tensor_value_info("image_embeds", TensorProto.FLOAT, ["batch", 4])],
    [numpy_helper.from_array(weights, "projection")],
)
model = helper.make_model(graph, opset_imports=[helper.make_opsetid("", 17)])
model.ir_version = 8
onnx.checker.check_model(model)
onnx.save(model, Path(__file__).with_name("vision.onnx"))
