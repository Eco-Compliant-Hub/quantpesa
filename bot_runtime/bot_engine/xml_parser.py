import xml.etree.ElementTree as ET
import json
import sys


def _strip_ns(tag):
    return tag.split('}')[-1] if '}' in tag else tag


def parse_field(field_el):
    return {
        "name": field_el.get("name"),
        "value": field_el.text,
        "var_id": field_el.get("id"),
    }


def parse_mutation(mutation_el):
    return {k: v for k, v in mutation_el.attrib.items() if k != "xmlns"}


def parse_block(block_el):
    node = {
        "node_type": _strip_ns(block_el.tag),
        "block_type": block_el.get("type"),
        "id": block_el.get("id"),
        "disabled": block_el.get("disabled") == "true",
        "collapsed": block_el.get("collapsed") == "true",
        "deletable": block_el.get("deletable") != "false",
        "fields": [],
        "mutation": None,
        "values": {},
        "statements": {},
        "next": None,
        "comment": None,
    }

    for child in block_el:
        tag = _strip_ns(child.tag)

        if tag == "field":
            node["fields"].append(parse_field(child))

        elif tag == "mutation":
            node["mutation"] = parse_mutation(child)

        elif tag == "comment":
            node["comment"] = child.text

        elif tag == "value":
            real_block = None
            shadow_block = None
            for inner in child:
                inner_tag = _strip_ns(inner.tag)
                if inner_tag == "block":
                    real_block = parse_block(inner)
                elif inner_tag == "shadow":
                    shadow_block = parse_block(inner)
            node["values"][child.get("name")] = real_block or shadow_block

        elif tag == "statement":
            stack = []
            for inner in child:
                if _strip_ns(inner.tag) == "block":
                    stack.extend(_flatten_chain(inner))
            node["statements"][child.get("name")] = stack

        elif tag == "next":
            for inner in child:
                if _strip_ns(inner.tag) == "block":
                    node["next"] = parse_block(inner)

    return node


def _flatten_chain(first_block_el):
    chain = []
    current_el = first_block_el
    while current_el is not None:
        node = parse_block(current_el)
        next_el = None
        for child in current_el:
            if _strip_ns(child.tag) == "next":
                for inner in child:
                    if _strip_ns(inner.tag) == "block":
                        next_el = inner
        node["next"] = None
        chain.append(node)
        current_el = next_el
    return chain


def parse_variables(root):
    variables = []
    for variables_el in root.findall(".//{*}variables"):
        for var_el in variables_el:
            if _strip_ns(var_el.tag) == "variable":
                variables.append({
                    "id": var_el.get("id"),
                    "name": var_el.text,
                })
    return variables


def parse_dbot_xml(xml_string):
    root = ET.fromstring(xml_string)

    variables = parse_variables(root)

    top_level_blocks = {}
    for child in root:
        if _strip_ns(child.tag) == "block":
            block_node = parse_block(child)
            key = block_node["block_type"]
            if key == "procedures_defnoreturn":
                top_level_blocks.setdefault("procedures", []).append(block_node)
            else:
                top_level_blocks[key] = block_node

    return {
        "source_format": "dbot_blockly_xml",
        "variables": variables,
        "top_level_blocks": top_level_blocks,
    }


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: python xml_parser.py path/to/bot.xml", file=sys.stderr)
        sys.exit(1)

    with open(sys.argv[1], "r", encoding="utf-8") as f:
        xml_content = f.read()

    result = parse_dbot_xml(xml_content)
    print(json.dumps(result, indent=2))
