'use strict';

const structure_template = (`
<section class="title">
    <h1>{{ title }}</h1>
    <div class="date">{{ date }}</div>
</section>
<section class="content">
    {{{ html }}}
</section>`);

exports.structure_template = structure_template;