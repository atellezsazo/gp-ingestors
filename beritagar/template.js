'use strict';

const structure_template = (`
<section class="title">
    <h1>{{ title }}</h1>
    {{{ article_info }}}
</section>
<section class="body">
    {{{ body }}}
</section>
`);


exports.structure_template = structure_template;
