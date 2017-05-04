'use strict';

const structure_template = (`
<section class="title">
    <h1>{{ title }}</h1>
    {{{ by_line }}}
</section>
<section class="body">
    {{{ post_body }}}
</section>`);

exports.structure_template = structure_template;