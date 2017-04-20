'use strict';

const structure_template = (`
<section class="post-heading">
    <h1> {{title}} </h1>
    <div> {{{metadata}}} </div>
    <div class="main-image">
        <img data-libingester-asset-id="{{ main_image.asset_id }}">
    </div>
</section>
<section class="post-body">
    {{{ post_body }}}
</section>`);

exports.structure_template = structure_template;
