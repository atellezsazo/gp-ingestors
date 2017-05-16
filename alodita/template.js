'use strict';

const structure_template = (`
<section class="header">
    <div class="extra-header">
        <div class="extra-header-right">
            <span class="date-published">{{date_post}}</span>
        </div>
    </div>
    <h1>{{ title }}</h1>
</section>
<section class="body">
    {{{ body }}}
</section>
`);

exports.structure_template = structure_template;