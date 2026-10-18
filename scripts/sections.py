"""Shared by the build scripts: number the deck's sections by their position.

Every <section class="page"> gets data-slide="N" and every eyebrow number
inside it (<span class="num">) becomes NN, so adding or removing a section can
never leave two sections with the same number.
"""
import re


def renumber(html):
    parts = re.split(r'(<section class="page)', html)
    out, n = parts[0], 0
    for i in range(1, len(parts), 2):
        n += 1
        body = re.sub(r'data-slide="\d+"', f'data-slide="{n}"', parts[i + 1], count=1)
        body = re.sub(r'<span class="num">\d+</span>', f'<span class="num">{n:02d}</span>', body)
        out += parts[i] + body
    return out, n
